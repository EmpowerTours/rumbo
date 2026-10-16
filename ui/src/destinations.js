// Destination pages are pure data: add a city by adding an entry here (no other code changes).
//   match:    lowercase substrings; an on-chain listing / venue / stop belongs to the FIRST destination
//             whose match hits its place, city or name (the `fallback` destination takes the rest)
//   spots:    [keyword, x, y] pin positions on the 600x420 schematic map
//   map:      static drawing — streets grid box, green squares, labels, an optional river path
export const DESTINATIONS = [
  {
    slug: 'cdmx',
    name: { en: 'Mexico City · CDMX', es: 'Ciudad de México · CDMX' },
    sub: { en: 'Roma, Condesa, Coyoacán and the Centro — guides, stays, live shows and sponsored stops, every booking through escrow.',
      es: 'Roma, Condesa, Coyoacán y el Centro — guías, hospedajes, shows en vivo y paradas patrocinadas, cada reserva en garantía.' },
    match: ['cdmx', 'ciudad de méxico', 'mexico city', 'coyoac', 'roma norte', 'condesa'],
    spots: [['foro indie', 292, 196], ['mural', 236, 196], ['frida', 336, 352], ['coyoac', 330, 360], ['loft', 262, 220], ['roma', 250, 206], ['condesa', 186, 236], ['centro', 360, 120], ['zócalo', 380, 110], ['cdmx', 300, 220]],
    map: {
      grid: { x0: 130, y0: 50, x1: 470, y1: 290, step: 34 },
      river: 'M0 300 C 140 280, 220 320, 340 300 S 520 270, 600 290',
      greens: [[136, 100, 74, 46, 'Bosque de Chapultepec'], [176, 248, 30, 22, 'Parque México'], [366, 96, 30, 26, 'Zócalo']],
      labels: [[282, 240, 'Roma Norte', 'middle'], [150, 232, 'Condesa', 'middle'], [381, 150, 'Centro Histórico', 'middle'], [330, 392, '↓ Coyoacán · 9 km', 'middle']],
    },
  },
  {
    slug: 'oaxaca',
    fallback: true,
    name: { en: 'Oaxaca de Juárez', es: 'Oaxaca de Juárez' },
    sub: { en: 'Guides, stays, live shows and sponsored stops — every booking goes through escrow.',
      es: 'Guías, hospedajes, shows en vivo y paradas patrocinadas — cada reserva pasa por garantía.' },
    match: ['oaxaca', 'jalatlaco', 'monte alb', 'etnobot', 'santo domingo', 'alcal'],
    spots: [['etnobot', 338, 128], ['santo-domingo', 300, 150], ['santo domingo', 300, 150], ['alcal', 282, 196], ['jalatlaco', 420, 170],
      ['foro-lumbre', 436, 196], ['foro lumbre', 436, 196], ['xochimilco', 236, 86], ['monte alb', 70, 360], ['centro', 282, 262], ['oaxaca', 300, 300]],
    map: {
      grid: { x0: 150, y0: 60, x1: 480, y1: 300, step: 30 },
      river: 'M0 330 C 120 300, 200 360, 330 345 S 520 300, 600 320',
      greens: [[262, 246, 40, 32, 'Zócalo'], [318, 112, 42, 30, '']],
      labels: [[300, 108, 'Santo Domingo', 'middle'], [420, 150, 'Jalatlaco', 'middle'], [236, 66, 'Xochimilco', 'middle'], [268, 214, 'Alcalá', 'end'], [70, 392, '→ Monte Albán · 10 km', 'middle']],
    },
  },
];

export const destBySlug = (slug) => DESTINATIONS.find((d) => d.slug === slug) || DESTINATIONS.find((d) => d.fallback);
/** Which destination a free-text place belongs to. */
export function destOf(...texts) {
  const t = texts.join(' ').toLowerCase();
  return (DESTINATIONS.find((d) => d.match.some((m) => t.includes(m))) || DESTINATIONS.find((d) => d.fallback)).slug;
}
