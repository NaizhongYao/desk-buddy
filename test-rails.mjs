import { placement, coveredHoles, occupied, holes } from './dist/breadboard.mjs';

const parts = ['esp', 'oled', 'amp', 'mic', 'speaker'].map((id) => placement(id));
const cover = coveredHoles(parts);
const used = occupied(parts);
const rails = holes.filter((h) => h.net.includes('+') || h.net.includes('-'));
const free = rails.filter((h) => !cover.has(h.id) && !used.has(h.id));
const byNet = {};
for (const h of free) {
  byNet[h.net] = (byNet[h.net] || 0) + 1;
}
console.log('free rail holes by net', byNet);
console.log(
  'sample L-',
  free.filter((h) => h.net === 'L-').map((h) => h.id).slice(0, 8),
);
console.log(
  'sample L+',
  free.filter((h) => h.net === 'L+').map((h) => h.id).slice(0, 8),
);
console.log(
  'sample R-',
  free.filter((h) => h.net === 'R-').map((h) => h.id).slice(0, 8),
);
console.log(
  'sample R+',
  free.filter((h) => h.net === 'R+').map((h) => h.id).slice(0, 8),
);
