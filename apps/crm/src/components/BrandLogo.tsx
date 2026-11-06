import Image from "next/image";

/**
 * Logo da Lovet Distribuidora (imagem em public/brand).
 *
 * O logo tem texto grafite, então em fundo escuro ele vai dentro de uma
 * "plaquinha" branca arredondada (`placa`); em fundo claro (`placa={false}`)
 * aparece solto. `marca` usa só o coração, para espaços pequenos.
 */
export function BrandLogo({
  alturaPx = 56, marca = false, placa = true, className = "",
}: { alturaPx?: number; marca?: boolean; placa?: boolean; className?: string }) {
  // Proporções dos arquivos: completo 612×678 (0,903), coração ≈ 1:1.
  const largura = marca ? alturaPx : Math.round(alturaPx * (612 / 678));
  const img = (
    <Image
      src={marca ? "/brand/coracao-lovet.png" : "/brand/logo-lovet.png"}
      alt="Lovet Distribuidora"
      width={marca ? 360 : 612}
      height={marca ? 360 : 678}
      priority
      style={{ height: alturaPx, width: largura }}
      className="object-contain"
    />
  );
  if (!placa) return <span className={`inline-flex ${className}`}>{img}</span>;
  return <span className={`inline-flex rounded-2xl bg-[#ffffff] p-2 shadow-sm ${className}`}>{img}</span>;
}
