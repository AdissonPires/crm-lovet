/**
 * Esqueleto mostrado NA HORA do clique em qualquer página do menu (o menu
 * lateral, do layout, continua visível). Sem isto a tela ficava parada na
 * página anterior até a nova terminar de carregar — parecia travado.
 */
export default function Carregando() {
  const bloco = "rounded-2xl bg-zinc-200/60 animate-pulse";
  return (
    <div className="p-4 md:p-8 space-y-6" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-zinc-200/70 animate-pulse" />
        <div className="h-7 w-64 rounded-lg bg-zinc-200/70 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`${bloco} h-28`} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={`${bloco} h-72 lg:col-span-2`} />
        <div className={`${bloco} h-72`} />
      </div>
      <div className={`${bloco} h-56`} />
    </div>
  );
}
