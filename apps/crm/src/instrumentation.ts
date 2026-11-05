/**
 * Fuso do servidor = Brasília. O código foi escrito rodando no Docker com
 * TZ=America/Sao_Paulo (datas "AAAA-MM-DDT00:00:00" lidas como meia-noite
 * local, início de mês com `new Date(ano, mês, 1)`...). Na Vercel o processo
 * sobe em UTC: o filtro de período do dashboard recuava um dia a cada clique
 * e os limites de mês/dia ficavam 3 h deslocados. Node relê `process.env.TZ`
 * em tempo de execução, então definir aqui, antes da 1ª requisição, basta.
 */
export function register() {
  process.env.TZ = "America/Sao_Paulo";
}
