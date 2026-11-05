/**
 * Wordmark da marca, em SVG inline.
 *
 * Inline e não via <Image src="...svg">: `currentColor` só é resolvido quando o
 * SVG faz parte do documento. Carregado como imagem externa, o navegador o
 * trata como bitmap opaco e a cor do CSS pai não chega nele — a logo sairia
 * preta sobre a sidebar azul. Assim o mesmo componente serve em fundo escuro
 * (herda branco) e claro (herda a cor do texto).
 */
export function BrandLogo({ className = "h-6 w-auto" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 96"
      className={className}
      role="img"
      aria-label="Lovet Distribuidora"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="70"
        fontFamily="Poppins, Montserrat, 'Century Gothic', 'Avenir Next', var(--font-geist-sans), 'Helvetica Neue', Arial, sans-serif"
        fontSize="76"
        fontWeight={700}
        letterSpacing="-1.5"
        fill="currentColor"
      >
        Lovet
      </text>
    </svg>
  );
}
