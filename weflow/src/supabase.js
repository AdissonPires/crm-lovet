import { createClient } from '@supabase/supabase-js'

// Upload direto de arquivos para o Supabase Storage do projeto da Lovet. Defina
// VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (chave publicável) no .env. Sem elas, o
// app funciona, mas envio de anexos/fotos não: o cliente aponta para um endereço local
// inexistente e o upload mostra erro — nunca para o projeto de outra empresa.
const url = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sem-chave-configurada'

export const supabase = createClient(url, key)

export const MEDIA_BUCKET = 'weflow-media'
export const CLIENT_MEDIA_BUCKET = 'weflow-client-media'

// Bucket dedicado para anexos de notas. Criar um bucket novo no Supabase exige
// o dashboard/CLI (fora do alcance deste código) — por ora reaproveita o bucket
// de mídia de clientes, já provisionado, para não quebrar o upload. Assim que
// um bucket 'weflow-note-files' existir de fato no projeto, é só apontar
// esta constante para ele.
export const NOTE_FILES_BUCKET = CLIENT_MEDIA_BUCKET

// Bucket das fotos de perfil. Mesma ressalva do NOTE_FILES_BUCKET: provisionar
// um bucket 'avatars' exige o dashboard/CLI do Supabase, então por ora os
// arquivos vão para o bucket já existente, sob o prefixo `avatars/`.
export const AVATARS_BUCKET = CLIENT_MEDIA_BUCKET

// extrai o caminho do objeto a partir da URL pública do bucket
export function storagePathFromUrl(publicUrl, bucket = MEDIA_BUCKET) {
  const marker = `/object/public/${bucket}/`
  const idx = publicUrl.indexOf(marker)
  return idx === -1 ? null : decodeURIComponent(publicUrl.slice(idx + marker.length))
}
