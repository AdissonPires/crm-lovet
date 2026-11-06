// Entrada direta vinda do CRM da Lovet (botão WeFlow).
//
// O CRM assina um token curto (HS256, 60 s, audiência "weflow") com o segredo
// compartilhado SSO_SHARED_SECRET. Aqui o token é verificado, o usuário é criado
// ou atualizado no workspace da Lovet e o app recebe a sessão normal (JWT).
// Sem SSO_SHARED_SECRET a rota fica desligada. O token do CRM vale uma vez só.
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { signToken } from '../auth.js'

const router = Router()
export default router

// jti já usados (memória da instância; o token expira em 60 s, então a janela é curta).
const usados = new Map()
const lembrar = (jti, expSeg) => {
  const agora = Date.now()
  for (const [k, v] of usados) if (v < agora) usados.delete(k)
  usados.set(jti, expSeg * 1000)
}

const voltar = (res, motivo) => res.redirect(302, `/?sso_erro=${encodeURIComponent(motivo)}`)

router.get('/api/auth/sso', asyncRoute(async (req, res) => {
  const segredo = process.env.SSO_SHARED_SECRET
  if (!segredo || segredo.length < 24) return voltar(res, 'desligado')

  let p
  try {
    p = jwt.verify(String(req.query.token || ''), segredo, { algorithms: ['HS256'], audience: 'weflow' })
  } catch {
    return voltar(res, 'invalido')
  }
  const email = String(p.email || '').trim().toLowerCase()
  if (!email || !p.jti || usados.has(p.jti)) return voltar(res, 'invalido')
  lembrar(p.jti, p.exp)

  // Workspace único da Lovet: o primeiro criado.
  const { data: workspaces, error: wsErr } = await supabase
    .from('weflow_workspaces')
    .select('id, name, color')
    .order('created_at', { ascending: true })
    .limit(1)
  if (wsErr) throw wsErr
  const workspace = workspaces?.[0]
  if (!workspace) return voltar(res, 'sem_workspace')

  const role = p.role === 'gestor' ? 'gestor' : 'funcionario'
  const nome = String(p.name || email).trim().slice(0, 120)

  let { data: user, error } = await supabase.from('weflow_users').select('*').eq('email', email).maybeSingle()
  if (error) throw error

  if (!user) {
    const criado = await supabase
      .from('weflow_users')
      .insert({
        workspace_id: workspace.id,
        name: nome,
        email,
        // Sem senha utilizável: o acesso é pelo CRM.
        password_hash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        role,
        status: 'active',
        job_title: null,
        color: null,
        avatar_url: null,
      })
      .select()
      .single()
    if (criado.error) throw criado.error
    user = criado.data
  } else {
    if (user.status === 'inactive') return voltar(res, 'inativo')
    // Papel e nome seguem o CRM a cada entrada.
    if (user.role !== role || user.name !== nome) {
      const up = await supabase.from('weflow_users').update({ role, name: nome }).eq('id', user.id).select().single()
      if (up.error) throw up.error
      user = up.data
    }
  }

  // O token da sessão vai no fragmento (#), que o navegador não envia a servidor nenhum.
  res.redirect(302, `/#sso=${signToken(user)}`)
}))
