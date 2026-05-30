// Validate the 100 agent-generated animation modules and assemble the gallery
// index. Any module that is missing or throws is replaced with a themed
// fallback so the gallery always has a complete, working 1–100. Run:
//   node scripts/build-gallery.mjs
import { readFile, writeFile, access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SPECS = join(ROOT, 'src', 'animations', 'specs');

// id → subject, mirrors the workflow's SYSTEMS list (used for fallbacks/SSR).
const SYSTEMS = [
  'Mitosis', 'Meiosis', 'Cytokinesis', 'Phagocytosis', 'Endocytosis',
  'Exocytosis', 'Osmosis across a membrane', 'Passive diffusion', 'Sodium-potassium pump', 'Fluid mosaic membrane',
  'Apoptosis (programmed cell death)', 'Autophagy', 'DNA replication fork', 'DNA transcription', 'mRNA translation at the ribosome',
  'Protein folding', 'mRNA splicing by the spliceosome', 'tRNA delivering amino acids', 'Enzyme-substrate lock and key', 'ATP synthase rotor',
  'Electron transport chain', 'Krebs cycle', 'Glycolysis', 'Macrophage engulfing a bacterium', 'Cytotoxic T-cell attack',
  'Antibody binding an antigen', 'Neutrophil chemotaxis', 'Inflammation response', 'Complement cascade', 'Natural killer cell strike',
  'Action potential travelling along an axon', 'Synaptic neurotransmitter release', 'Neural network firing', 'Saltatory conduction along myelin', 'Dendritic growth',
  'Heartbeat (cardiac cycle)', 'Blood flow in a capillary', 'Oxygen binding hemoglobin', 'Platelet clotting cascade', 'Red blood cells in single file',
  'Bacterial binary fission', 'Flagellum rotation', 'Bacteriophage infecting a cell', 'Viral replication burst', 'Biofilm formation',
  'Quorum sensing', 'Bacterial conjugation (plasmid transfer)', 'Chloroplast light reactions', 'Calvin cycle', 'Stomata opening and closing',
  'Sarcomere contraction', 'Actin-myosin sliding filaments', 'Embryo cleavage', 'Gastrulation', 'Cell differentiation',
  'Paramecium hunting prey', 'Amoeba pseudopod crawl', 'Euglena swimming to light', 'Diatom drifting', 'Cilia beating in a metachronal wave',
  'Sperm flagellar wave', 'Osmotic lysis (a cell bursting)', 'Plasmolysis (a plant cell shrinking)', 'Mitochondrion cristae', 'Golgi vesicle budding',
  'Endoplasmic reticulum flow', 'Lysosome digestion', 'Nuclear pore transport', 'Chromosome condensation', 'Mitotic spindle fibers',
  'Centriole duplication', 'Cell signaling cascade', 'Receptor-ligand binding', 'Hormone signaling', 'Calcium wave across a cell',
  'Gap junction exchange', 'Axon growth cone navigation', 'Photosynthetic oxygen bubbling', 'Root hair water uptake', 'Pollen tube growth',
  'Seed germination', 'Coral polyp feeding', 'Jellyfish pulse', 'Hydra tentacle capture', 'Slime mold network foraging',
  'Yeast budding', 'Fungal spore release', 'Mycelium spreading', 'Nitrogen-fixing root nodule', 'Alveolus gas exchange',
  'Kidney nephron filtration', 'Peristalsis in the gut', 'Insulin-glucose feedback', 'Circadian clock oscillation', 'Wound healing',
  'Stem cell niche', 'CRISPR cutting DNA', 'Telomere shortening', 'Cell colony forming', 'Symbiotic algae in a cell',
];

const PALETTES = new Set(['membrane', 'dna', 'blood', 'neuron', 'immune', 'energy', 'photosynth', 'microbe']);
const PAL_BY_ID = ['membrane', 'dna', 'neuron', 'immune', 'energy', 'photosynth', 'microbe', 'blood'];

const pad3 = (n) => String(n).padStart(3, '0');
const exists = (p) => access(p).then(() => true, () => false);

// A themed fallback animation, varied by id so each looks distinct. Four motion
// archetypes (orbit, wave, pulse-grid, drift) keep stand-ins from looking samey.
function fallbackSource(id, system) {
  const title = (system.length > 22 ? system.slice(0, 21) + '…' : system).replace(/"/g, '\\"');
  const palette = PAL_BY_ID[id % PAL_BY_ID.length];
  const style = id % 4;
  const cols = 50, rows = 18;
  const frames = [
    // 0: electrons orbiting a nucleus
    `frame(t){const cols=${cols},rows=${rows};const g=Array.from({length:rows},()=>Array(cols).fill(" "));const cx=cols/2,cy=rows/2;g[Math.round(cy)][Math.round(cx)]="@";for(let k=0;k<3;k++){const a=t*1.3+k*2.0944;const x=Math.round(cx+Math.cos(a)*(cols*0.32));const y=Math.round(cy+Math.sin(a)*(rows*0.38));if(y>=0&&y<rows&&x>=0&&x<cols)g[y][x]="o";const x2=Math.round(cx+Math.cos(a+Math.PI)*(cols*0.18));const y2=Math.round(cy+Math.sin(a+Math.PI)*(rows*0.22));if(y2>=0&&y2<rows&&x2>=0&&x2<cols)g[y2][x2]="*";}return g.map(r=>r.join("")).join("\\n");}`,
    // 1: travelling wave
    `frame(t){const cols=${cols},rows=${rows};const g=Array.from({length:rows},()=>Array(cols).fill(" "));for(let x=0;x<cols;x++){const y=Math.round(rows/2+Math.sin(x*0.4-t*2.2)*(rows*0.36));if(y>=0&&y<rows)g[y][x]="~";const y2=Math.round(rows/2+Math.sin(x*0.4-t*2.2+0.6)*(rows*0.30));if(y2>=0&&y2<rows&&g[y2][x]===" ")g[y2][x]=".";}return g.map(r=>r.join("")).join("\\n");}`,
    // 2: pulsing grid of cells
    `frame(t){const cols=${cols},rows=${rows};const g=Array.from({length:rows},()=>Array(cols).fill(" "));for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const v=Math.sin(x*0.5+t*2)+Math.cos(y*0.7-t*1.5);g[y][x]=v>1.2?"@":v>0.4?"o":v>-0.3?":":" ";}return g.map(r=>r.join("")).join("\\n");}`,
    // 3: drifting particles
    `frame(t){const cols=${cols},rows=${rows};const g=Array.from({length:rows},()=>Array(cols).fill(" "));for(let k=0;k<22;k++){const x=Math.round((k*7.3+t*9+Math.sin(k)*4)%cols);const y=Math.round((rows/2)+Math.sin(t*0.8+k)*((k%5)+1)*0.9);if(y>=0&&y<rows&&x>=0&&x<cols)g[y][x]=k%3===0?"O":k%3===1?"o":".";}return g.map(r=>r.join("")).join("\\n");}`,
  ];
  return `// Auto-generated fallback animation for #${id} (${system}).
export default {
  id: ${id},
  system: ${JSON.stringify(system)},
  title: "${title}",
  caption: ${JSON.stringify('A living rhythm — ' + system.toLowerCase() + '.')},
  cols: ${cols},
  rows: ${rows},
  palette: "${palette}",
  ${frames[style]}
};
`;
}

async function valid(mod, rows) {
  try {
    const a = mod?.default;
    if (!a || typeof a.frame !== 'function') return false;
    for (const t of [0, 0.37, 1.3, 2.5, 5.0, 9.9]) {
      const out = a.frame(t);
      if (typeof out !== 'string' || out.length === 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

let repaired = 0, generated = 0;
for (let id = 1; id <= 100; id++) {
  const file = join(SPECS, `anim-${pad3(id)}.js`);
  const system = SYSTEMS[id - 1];
  let good = false;
  if (await exists(file)) {
    try {
      // cache-bust so re-runs re-import fresh content
      const mod = await import(pathToFileURL(file).href + `?v=${Date.now()}_${id}`);
      good = await valid(mod);
      // Normalize palette to a known class; rewrite only if needed.
      if (good && !PALETTES.has(mod.default.palette)) {
        const src = await readFile(file, 'utf8');
        const fixed = src.replace(/palette:\s*["'][^"']*["']/, `palette: "${PAL_BY_ID[id % PAL_BY_ID.length]}"`);
        if (fixed !== src) await writeFile(file, fixed);
      }
    } catch {
      good = false;
    }
  }
  if (!good) {
    await writeFile(file, fallbackSource(id, system));
    generated++;
    if (await exists(file)) repaired++;
  }
}

// Emit the index module: static imports of all 100, exported sorted by id.
const imports = [];
const refs = [];
for (let id = 1; id <= 100; id++) {
  const v = `a${pad3(id)}`;
  imports.push(`import ${v} from './specs/anim-${pad3(id)}.js';`);
  refs.push(v);
}
const index = `// AUTO-GENERATED by scripts/build-gallery.mjs — do not edit by hand.
${imports.join('\n')}

export const animations = [${refs.join(', ')}].sort((a, b) => a.id - b.id);
`;
await writeFile(join(ROOT, 'src', 'animations', 'index.js'), index);

console.log(`gallery: 100 animations assembled; ${generated} fallback(s) generated.`);
