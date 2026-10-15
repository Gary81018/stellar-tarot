/** Original, dependency-free illustrations for the Stellar Tarot deck. */
const PAPER = '#f7f2e8';
const INK = '#583f57';
const GOLD = '#b89a6a';
const MUTED = '#ded2c0';
const TITLES = [
  'THE FOOL', 'THE MAGICIAN', 'THE HIGH PRIESTESS', 'THE EMPRESS',
  'THE EMPEROR', 'THE HIEROPHANT', 'THE LOVERS', 'THE CHARIOT',
  'STRENGTH', 'THE HERMIT', 'WHEEL OF FORTUNE', 'JUSTICE',
  'THE HANGED MAN', 'DEATH', 'TEMPERANCE', 'THE DEVIL',
  'THE TOWER', 'THE STAR', 'THE MOON', 'THE SUN', 'JUDGEMENT', 'THE WORLD',
];
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
let illustrationId = 0;

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const path = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const circle = (x, y, r, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" ${extra}/>`;
const line = (x1, y1, x2, y2, extra = '') => `<path d="M${x1} ${y1}L${x2} ${y2}" ${extra}/>`;

function star(x, y, radius = 7, points = 4, inner = radius / 3) {
  const coords = Array.from({ length: points * 2 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / points;
    const r = i % 2 ? inner : radius;
    return `${(x + Math.cos(angle) * r).toFixed(2)},${(y + Math.sin(angle) * r).toFixed(2)}`;
  }).join(' ');
  return `<polygon points="${coords}"/>`;
}

function radial(x, y, radius, length, count = 24) {
  return Array.from({ length: count }, (_, i) => {
    const a = i * Math.PI * 2 / count;
    const end = radius + (i % 2 ? length * .5 : length);
    return line((x + Math.cos(a) * radius).toFixed(2), (y + Math.sin(a) * radius).toFixed(2), (x + Math.cos(a) * end).toFixed(2), (y + Math.sin(a) * end).toFixed(2));
  }).join('');
}

function sprig(x, y, height = 45, direction = 1) {
  const dx = height * .2 * direction;
  let leaves = path(`M${x} ${y}Q${x + dx} ${y - height / 2} ${x + dx} ${y - height}`);
  for (let i = 1; i < 5; i++) {
    const ly = y - i * height / 5;
    const lx = x + dx * (1 - (1 - i / 5) ** 2);
    const width = height * .15;
    leaves += path(`M${lx} ${ly}Q${lx - width} ${ly - 2} ${lx - width * .85} ${ly - height * .16}Q${lx - 1} ${ly - height * .15} ${lx} ${ly}`);
    leaves += path(`M${lx} ${ly - height * .07}Q${lx + width} ${ly - height * .07} ${lx + width} ${ly - height * .21}Q${lx + 1} ${ly - height * .2} ${lx} ${ly - height * .07}`);
  }
  return leaves;
}

function flower(x, y, radius = 5) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3;
    return circle((x + Math.cos(a) * radius * .63).toFixed(2), (y + Math.sin(a) * radius * .63).toFixed(2), radius * .5);
  }).join('') + circle(x, y, radius * .3, `fill="${GOLD}" stroke="none"`);
}

function constellation() {
  return `<g stroke="${GOLD}" stroke-width=".65">${star(61, 102, 4)}${star(173, 101, 4)}${star(47, 148, 3)}${star(183, 148, 3)}${circle(75, 80, 1.2)}${circle(154, 80, 1.2)}${circle(56, 124, .9)}${circle(174, 126, .9)}</g>`;
}

function landscape(y = 241) {
  return `<g stroke-width=".75">${path(`M27 ${y + 8}Q58 ${y - 17} 91 ${y}T152 ${y - 2}T207 ${y + 1}`)}${path(`M27 ${y + 21}Q66 ${y + 4} 111 ${y + 17}T209 ${y + 12}`)}${path(`M27 ${y + 32}Q79 ${y + 12} 128 ${y + 29}T205 ${y + 23}`)}${sprig(43, 288, 35)}${sprig(185, 287, 43, -1)}</g>`;
}

function mountains() {
  return path('M29 228L59 194 85 219 123 171 158 211 178 195 202 222') + path('M107 190L122 187 126 179M49 206L60 211 66 203M148 201L157 211 166 205', 'stroke-width=".65"');
}

function face(x, y, r = 20) {
  return circle(x, y, r) + path(`M${x - r * .56} ${y - 2}q${r * .2} -3 ${r * .36} 0m${r * .42} 0q${r * .2} -3 ${r * .36} 0M${x} ${y - 3}l-2 ${r * .37}h4M${x - r * .23} ${y + r * .48}q${r * .23} 3 ${r * .46} 0`, 'stroke-width=".75"');
}

function crescent(x, y, r = 26) {
  return path(`M${x + r * .3} ${y - r * .95}A${r} ${r} 0 1 0 ${x + r * .3} ${y + r * .95}A${r * .93} ${r * .93} 0 0 1 ${x + r * .3} ${y - r * .95}Z`, `fill="${PAPER}"`);
}

function vase(x, y, scale = 1, angle = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">${path('M-8 0H8L5 8Q19 22 11 33Q0 41-11 33Q-19 22-5 8Z', `fill="${PAPER}"`)}${path('M-7 4H7M-12 27Q0 33 12 27M-8 31Q0 35 8 31', 'stroke-width=".65"')}</g>`;
}

function figure(x, y, { scale = 1, robe = true, crown = false } = {}) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">${circle(0, 0, 8, `fill="${PAPER}"`)}${path('M-6-7Q-1-15 7-7M-3 3Q0 5 3 3', 'stroke-width=".75"')}${robe ? path('M-7 10Q-15 23-18 58Q0 65 18 58L8 11ZM-5 18L-9 54M5 19L9 54', `fill="${PAPER}"`) : path('M-5 9L-8 32-14 52M5 9L8 32 14 52M-8 31L8 31M-6 12L-20 25M6 12L20 25')}${crown ? path('M-9-10L-10-18-4-14 0-21 4-14 10-18 9-10Z', `fill="${PAPER}"`) : ''}</g>`;
}

function cup(x, y, scale = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">${path('M-12-12H12Q13 5 2 8V16H9V19H-9V16H-2V8Q-13 5-12-12Z', `fill="${PAPER}"`)}${path('M-12-8Q-23-10-19 0Q-16 5-9 3M12-8Q23-10 19 0Q16 5 9 3M-9-7H9M-8-3Q0 2 8-3', 'stroke-width=".7"')}</g>`;
}

function sword(x, y, scale = 1, angle = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">${path('M0-30L5-19 3 16H11V20H3V33H-3V20H-11V16H-3L-5-19Z', `fill="${PAPER}"`)}${line(0, -23, 0, 15, 'stroke-width=".65"')}${circle(0, 35, 3)}</g>`;
}

function wand(x, y, scale = 1, angle = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">${path('M-2-31L2-31 3 32H-3Z', `fill="${PAPER}"`)}${path('M2-14Q14-18 11-27Q1-25 2-14M-2 1Q-15-3-11-13Q-1-11-2 1M2 17Q14 14 12 4Q2 7 2 17')}${circle(0, -34, 2)}</g>`;
}

function coin(x, y, scale = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">${circle(0, 0, 16, `fill="${PAPER}"`)}${circle(0, 0, 13, 'stroke-width=".65"')}${path('M0-11L6.5 9-10.5-3.5H10.5L-6.5 9Z', 'stroke-width=".85"')}${circle(0, 0, 1, `fill="${GOLD}" stroke="none"`)}</g>`;
}

function majorScene(n) {
  switch (n) {
    case 0: return constellation() + mountains() + path('M28 254L91 246 96 256 80 264 90 286H27', `fill="${PAPER}"`) + figure(88, 157, { robe: false }) + path('M80 170L69 189 86 196M96 168L117 156M113 153L135 163M116 157L123 126', 'stroke-width="1.2"') + circle(131, 162, 9, `fill="${PAPER}"`) + flower(123, 123, 5) + path('M50 236L55 226 64 228 69 236 78 235 82 242 67 244 62 240 56 246M56 226L55 219 61 226') + sprig(39, 283, 38) + circle(165, 114, 20) + radial(165, 114, 24, 5, 16);
    case 1: return constellation() + path('M88 104C60 82 68 67 87 72C110 78 115 107 140 107C164 107 169 76 149 73C125 68 112 95 88 104Z', `stroke="${GOLD}"`) + figure(115, 137, { robe: true }) + path('M105 150L84 129 79 109M124 151L144 174 146 193M76 100L81 120') + path('M65 207H165V216H65ZM75 216V259M155 216V259M80 216L80 255M150 216V255', `fill="${PAPER}"`) + cup(88, 195, .5) + coin(139, 198, .43) + sword(115, 198, .43, 90) + landscape(258) + flower(46, 251) + flower(178, 247);
    case 2: return constellation() + path('M45 128H73V263H45ZM42 121H76V129H42ZM157 128H185V263H157ZM154 121H188V129H154Z', 'stroke-width=".8"') + path('M49 134V257M69 134V257M161 134V257M181 134V257') + crescent(115, 102, 17) + figure(115, 159, { crown: true }) + path('M98 183L93 243H139L132 182M94 244Q114 231 139 244M105 186L129 190 126 218 102 214Z', `fill="${PAPER}"`) + path('M106 193L124 196M105 199L123 202M104 205L122 208', 'stroke-width=".6"') + crescent(115, 265, 13) + sprig(79, 284, 37) + sprig(151, 284, 37, -1);
    case 3: return constellation() + radial(115, 121, 31, 6, 12) + figure(115, 122, { crown: true }) + path('M85 161L73 224Q114 253 155 224L143 161M84 180Q115 211 146 180M81 196Q113 228 149 196M77 213Q113 241 153 213', `fill="${PAPER}"`) + path('M85 160L69 178 60 164M143 161L154 174 165 156M165 137V191') + circle(165, 132, 5) + landscape(255) + sprig(50, 279, 73) + sprig(178, 279, 73, -1) + flower(112, 215, 9);
    case 4: return mountains() + path('M69 140H161V251H69ZM77 148H153V235H77ZM60 192H84V251H60ZM146 192H170V251H146', `fill="${PAPER}"`) + figure(115, 150, { crown: true }) + path('M97 186L90 227 101 253H113L109 224 115 212 121 224 117 253H130L140 227 132 185', `fill="${PAPER}"`) + path('M91 181L73 170M139 181L157 169M73 153V210M67 158H79') + circle(157, 166, 6) + path('M65 139Q49 125 58 119Q72 114 72 132M165 139Q181 125 172 119Q158 114 158 132') + landscape(265) + star(115, 95, 10, 4);
    case 5: return constellation() + path('M49 262V145Q49 75 115 75Q181 75 181 145V262M60 262V145Q60 88 115 88Q170 88 170 145V262M49 151H73M157 151H181', 'stroke-width=".8"') + figure(115, 145, { crown: true }) + path('M97 177L89 234H141L133 177M106 132L103 108H127L124 132ZM104 116H126M106 125H124M91 172L79 159M137 173L153 159M153 132V195M144 142H162M146 150H160') + path('M91 253L136 279M139 253L94 279M99 271L96 279 103 282M130 271L133 279 126 282') + circle(88, 251, 7) + circle(142, 251, 7);
    case 6: return constellation() + circle(115, 110, 21) + radial(115, 110, 25, 10, 24) + path('M111 148Q85 141 72 126Q68 146 90 162M119 148Q145 141 158 126Q162 146 140 162') + figure(76, 195, { robe: false }) + figure(154, 195, { robe: false }) + path('M87 207L114 216 142 207M115 245V161M115 184Q95 174 94 159Q114 162 115 184M115 200Q136 186 136 169Q115 176 115 200') + landscape(261) + flower(115, 157, 6);
    case 7: return constellation() + path('M66 130Q115 104 164 130L158 146H72ZM74 147V198M156 147V198M65 200H165L159 249H71Z', `fill="${PAPER}"`) + star(86, 133, 4) + star(115, 124, 4) + star(144, 133, 4) + figure(115, 163, { crown: true, scale: .75 }) + circle(70, 242, 15, `fill="${PAPER}"`) + circle(160, 242, 15, `fill="${PAPER}"`) + circle(70, 242, 5) + circle(160, 242, 5) + path('M78 261Q77 246 90 246Q105 247 103 266H75M127 266Q125 247 140 246Q153 246 152 261H155V266Z', `fill="${PAPER}"`) + crescent(115, 226, 13) + landscape(276);
    case 8: return constellation() + path('M99 109C75 92 86 78 101 90L127 107C151 125 153 91 135 88C119 85 115 108 99 109Z', `stroke="${GOLD}"`) + figure(110, 147) + path('M101 160L80 192 100 213M119 160L143 190 132 211') + path('M85 227Q88 209 107 214L145 216Q164 219 166 235L157 242 154 259H145L143 240 112 241 106 260H96L98 236M163 230Q184 226 178 213', `fill="${PAPER}"`) + circle(93, 219, 19, `fill="${PAPER}"`) + face(93, 219, 12) + landscape(272) + flower(110, 136, 6);
    case 9: return constellation() + crescent(160, 106, 16) + mountains() + figure(110, 162) + path('M108 145Q91 150 87 183L76 251Q112 263 140 248L124 176Q123 151 108 145ZM94 174L110 174M97 188L85 244M120 188L130 245', `fill="${PAPER}"`) + path('M121 179L151 164M91 183L77 195M77 175V263M151 151V161M142 162H160V186H142Z') + star(151, 174, 7) + radial(151, 174, 19, 6, 12) + landscape(270);
    case 10: return constellation() + circle(115, 182, 62) + circle(115, 182, 57) + circle(115, 182, 42) + circle(115, 182, 15) + Array.from({ length: 8 }, (_, i) => `<g transform="rotate(${i * 45} 115 182)">${line(115, 166, 115, 141)}${star(115, 132, 4)}</g>`).join('') + star(115, 182, 11, 8) + path('M64 109Q47 112 47 128Q34 129 34 143M166 109Q183 112 183 128Q196 129 196 143M53 252Q69 254 66 267Q78 265 87 278M177 252Q161 254 164 267Q152 265 143 278', 'stroke-width=".85"') + sprig(44, 283, 45) + sprig(186, 283, 45, -1);
    case 11: return constellation() + figure(115, 151, { crown: true }) + path('M95 179L83 252H147L135 179M103 184L96 244M127 184L134 244M98 176L66 176M132 175L157 161') + sword(158, 153, .9) + path('M65 148V191M42 160H88M45 161L36 191H55ZM85 161L75 191H94Z', `fill="${PAPER}"`) + circle(65, 149, 4) + landscape(268) + star(115, 105, 12, 4);
    case 12: return constellation() + path('M58 114H172M64 111V278M166 111V278M58 121H172M69 116L69 268M161 116L161 268') + sprig(66, 172, 47) + sprig(164, 211, 47, -1) + path('M115 118V143L97 175 109 194M115 143L135 166 123 179M104 190L102 224 128 224 124 190ZM104 199L84 213 103 222M126 199L145 213 127 222', `fill="${PAPER}"`) + circle(115, 235, 10) + circle(115, 235, 19, `stroke="${GOLD}"`) + landscape(280);
    case 13: return constellation() + circle(115, 115, 22) + radial(115, 115, 26, 7, 20) + mountains() + path('M71 259L150 148M134 165Q169 158 186 184Q176 141 149 141L140 153', `fill="${PAPER}"`) + path('M104 253Q103 209 118 190M112 224Q86 221 86 205Q111 207 112 224M109 238Q132 225 143 231Q130 248 109 238') + flower(122, 183, 17) + circle(122, 183, 6) + path('M38 269Q78 252 112 267T199 265M47 279Q89 269 115 279T190 277', 'stroke-width=".75"');
    case 14: return constellation() + circle(115, 131, 16, `stroke="${GOLD}"`) + path('M101 164Q68 133 55 144Q59 184 95 198M129 164Q162 133 175 144Q171 184 135 198M93 175L64 151M137 175L166 151M89 185L65 163M141 185L165 163') + figure(115, 134) + path('M98 166L91 239H139L132 165M98 168L76 194M131 170L148 183M108 154H122L115 165Z', `fill="${PAPER}"`) + vase(76, 191, .6, -25) + vase(150, 181, .6, 35) + path('M144 199Q125 206 89 207M142 203Q120 214 87 211', `stroke="${GOLD}"`) + landscape(262);
    case 15: return constellation() + star(115, 104, 21, 5, 10) + path('M100 143Q70 110 70 148Q74 165 101 168M130 143Q160 110 160 148Q156 165 129 168M101 147L115 159 129 147 137 172 128 195H102L93 172Z', `fill="${PAPER}"`) + path('M103 170L109 174M127 170L121 174M109 185H121M102 196L86 226H144L128 196M88 203Q64 184 53 195L72 221M142 203Q166 184 177 195L158 221M101 226Q84 256 64 253M129 226Q146 256 166 253') + circle(62, 254, 7) + circle(168, 254, 7) + landscape(278);
    case 16: return constellation() + path('M137 81L105 127H127L97 172 155 113H131L148 81', `fill="${GOLD}" stroke="${GOLD}"`) + path('M88 163H142L151 268H79ZM84 151H95V142H104V151H125V142H135V151H146V163H84Z', `fill="${PAPER}"`) + path('M115 164L103 190 121 202 109 225 125 243M91 185H102M126 184H140M85 219H101M128 221H146M82 250H113M128 250H149M96 167V178M135 201V214M94 234V246', 'stroke-width=".8"') + path('M95 201V187Q95 179 103 179V202ZM126 238V225Q126 217 134 217V238Z', `fill="${INK}"`) + path('M73 174Q60 163 69 152Q67 165 77 167M155 173Q169 159 164 151Q176 164 166 179') + landscape(280);
    case 17: return `<g stroke="${GOLD}" stroke-width="1.1">${star(115, 112, 32, 8, 13)}${star(61, 137, 9, 8, 3)}${star(168, 137, 9, 8, 3)}${star(80, 170, 7, 8, 2.5)}${star(151, 176, 7, 8, 2.5)}${star(54, 191, 5, 8, 2)}${star(179, 197, 5, 8, 2)}${circle(115, 112, 4)}${line(115, 72, 115, 67)}${circle(83, 96, 1)}${circle(148, 95, 1)}</g>` + path('M29 235L58 215 83 233 111 203 147 230 170 212 202 237M98 219L111 215 117 210', 'stroke-width=".8"') + path('M29 253Q65 235 104 251Q138 268 202 249M32 270Q81 253 123 266T200 266M60 281Q94 270 119 277', 'stroke-width=".8"') + vase(88, 210, .85, 34) + vase(149, 222, .8, -35) + path('M73 239Q62 254 88 256M69 241Q57 259 90 262M163 248Q179 263 150 266M166 246Q186 265 153 272', `stroke="${GOLD}" stroke-width=".8"`) + sprig(43, 289, 47) + sprig(186, 290, 46, -1) + flower(186, 241, 4);
    case 18: return circle(115, 119, 45, 'stroke-width=".6"') + circle(115, 119, 40, `stroke="${GOLD}" stroke-width=".6" stroke-dasharray="1 5"`) + crescent(115, 119, 29) + `<g stroke="${GOLD}">${star(61, 118, 5)}${star(169, 117, 5)}${star(83, 168, 4)}${star(146, 168, 4)}${circle(115, 62, 1.4)}${circle(51, 155, 1)}${circle(179, 155, 1)}</g>` + path('M31 233L57 209 81 225 113 194 145 222 171 209 201 234', 'stroke-width=".75"') + path('M49 238V174H76V238M45 174V163H53V169H60V161H67V169H74V163H81V174ZM154 238V174H181V238M149 174V163H157V169H164V161H171V169H178V163H186V174Z', `fill="${PAPER}"`) + path('M59 194Q63 188 67 194V207H59ZM163 194Q167 188 171 194V207H163Z', `fill="${INK}" stroke-width=".7"`) + path('M51 216H62M64 227H75M155 218H166M169 229H180M53 181V188M178 181V188', 'stroke-width=".6"') + path('M115 207Q85 225 117 245T109 285M119 208Q93 224 125 245T120 285M30 253Q69 236 104 251M138 251Q169 238 202 253M29 269Q64 256 100 264M144 266Q169 253 202 268', 'stroke-width=".8"') + sprig(42, 288, 38) + sprig(186, 288, 38, -1);
    case 19: return `<g stroke="${GOLD}">${radial(115, 130, 35, 20, 32)}${circle(115, 130, 30)}${circle(115, 130, 27, 'stroke-width=".6"')}</g>` + face(115, 130, 24) + path('M27 238Q52 213 84 229Q115 199 148 226Q177 211 204 232M29 249Q71 229 112 244T202 240M28 264Q76 243 125 259T205 255M29 280Q92 258 148 275T202 270', 'stroke-width=".8"') + path('M63 286Q70 253 64 222M165 286Q158 252 165 221M64 256Q45 251 46 239Q63 240 64 256M67 244Q84 237 81 227Q66 230 67 244M165 253Q184 246 181 234Q165 238 165 253M161 263Q143 254 146 242Q160 245 161 263') + flower(64, 215, 12) + flower(165, 215, 12) + sprig(41, 287, 34) + sprig(188, 287, 34, -1) + `<g stroke="${GOLD}">${star(50, 168, 4)}${star(178, 169, 4)}${circle(79, 82, 1)}${circle(152, 82, 1)}</g>`;
    case 20: return constellation() + circle(115, 117, 25) + radial(115, 117, 29, 7, 16) + path('M98 156Q71 132 49 145Q64 178 99 179M132 156Q159 132 181 145Q166 178 131 179M92 164L61 149M138 164L169 149') + path('M103 152L143 180 148 171 108 144ZM139 175L145 197 162 176 148 171M119 161V186H134V171M124 169V181M120 175H130', `fill="${PAPER}"`) + figure(72, 224, { scale: .7 }) + figure(115, 213, { scale: .9 }) + figure(158, 224, { scale: .7 }) + path('M67 235L53 221 51 209M77 235L89 220M107 228L93 209M123 228L137 209M153 235L141 220M163 235L178 221 180 209') + landscape(278);
    case 21: return constellation() + `<g stroke="${GOLD}" stroke-width=".85">${path('M115 95C42 95 36 259 115 273C194 259 188 95 115 95Z')}${Array.from({ length: 10 }, (_, i) => {
      const a = i * Math.PI / 10 + .1;
      const x = 115 + Math.sin(a) * 60;
      const y = 184 - Math.cos(a) * 86;
      return `<ellipse cx="${x}" cy="${y}" rx="3.5" ry="8" transform="rotate(${i * 18 - 40} ${x} ${y})"/><ellipse cx="${230 - x}" cy="${y}" rx="3.5" ry="8" transform="rotate(${40 - i * 18} ${230 - x} ${y})"/>`;
    }).join('')}</g>` + figure(115, 157, { robe: false, scale: 1.1 }) + path('M105 169Q132 167 128 191Q124 208 101 217Q106 232 125 238M103 176L88 187M127 176L143 187M85 173L88 201M144 173L141 201', 'stroke-width="1.3"') + path('M105 95L115 104 125 95M105 272L115 262 125 272') + star(52, 114, 7, 4) + star(178, 114, 7, 4) + circle(51, 265, 7) + crescent(180, 265, 7);
    default: return majorScene(17);
  }
}

function normalizeSuit(suit = '') {
  const value = String(suit).toLowerCase();
  if (/cup|chalice|圣杯/.test(value)) return 'cups';
  if (/sword|宝剑/.test(value)) return 'swords';
  if (/pentacle|coin|星币|钱币/.test(value)) return 'pentacles';
  return 'wands';
}

function minorScene(card) {
  const suit = normalizeSuit(card.suit || card.id);
  const rankValue = card.rank ?? card.value ?? card.number ?? String(card.id || '').split('-').pop();
  const namedRanks = { ace: 1, page: 11, knight: 12, queen: 13, king: 14, 侍从: 11, 骑士: 12, 王后: 13, 国王: 14 };
  const rank = Math.max(1, Math.min(14, Number(rankValue) || namedRanks[String(rankValue).toLowerCase()] || 1));
  const symbol = { cups: cup, swords: sword, pentacles: coin, wands: wand }[suit];
  let art = constellation();
  if (rank === 1) {
    art += circle(115, 173, 52, `stroke="${GOLD}" stroke-width=".6"`) + radial(115, 173, 58, 6, 24);
    art += symbol(115, 173, suit === 'pentacles' ? 2 : 1.6);
    art += sprig(70, 262, 63) + sprig(160, 262, 63, -1);
  } else if (rank <= 10) {
    const scale = suit === 'wands' || suit === 'swords' ? .7 : .85;
    const rows = Math.ceil(rank / 2);
    const rowGap = Math.min(43, 147 / Math.max(1, rows - 1));
    const start = 180 - (rows - 1) * rowGap / 2;
    for (let i = 0; i < rank; i++) {
      const lastSolo = rank % 2 && i === rank - 1;
      art += symbol(lastSolo ? 115 : i % 2 ? 151 : 79, start + Math.floor(i / 2) * rowGap, scale);
    }
  } else {
    art += circle(115, 161, 45, `stroke="${GOLD}" stroke-width=".7"`);
    art += figure(115, 149, { crown: rank >= 13, scale: 1.15 });
    art += path('M104 166L83 188M125 166L147 186M96 204L88 248H143L135 205', `fill="${PAPER}"`);
    art += symbol(153, 175, .75);
    art += rank === 12 ? path('M72 246L66 225 74 210 88 213 95 225M70 216L69 204 80 213') : sprig(70, 258, 43);
    art += star(115, 98, rank === 14 ? 12 : 7, rank === 13 ? 8 : 4);
  }
  return art + landscape(269);
}

function metadata(card) {
  const id = String(card.id || '');
  const match = id.match(/(?:major|arcana)[-_]?(\d+)/i);
  const major = match ? Number(match[1]) : (card.arcana === 'major' || card.type === 'major' || card.suit === 'major') ? Number(card.number ?? card.arcanaIndex ?? card.index ?? 0) : typeof card === 'number' ? card : null;
  const title = card.english || card.englishName || card.nameEn || card.titleEn || card.en || (major !== null ? TITLES[major] : null) || card.name || 'THE TAROT';
  const index = major !== null ? ROMAN[major] ?? '' : card.rank ?? card.number ?? '✦';
  return { major, title: String(title).toUpperCase(), index: String(index).toUpperCase() };
}

/** Render a full card. Accepts any card metadata with an id such as `major-17`. */
export function cardArt(card = { id: 'major-17' }, options = {}) {
  if (options.dark || options.back) return cardBack(options);
  const { major, title, index } = metadata(card);
  const clipId = `stellar-card-${++illustrationId}`;
  const fontSize = title.length > 20 ? 8 : title.length > 15 ? 9 : 10;
  const label = escape(card.name || card.nameZh || title);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 360" role="img" aria-label="${label}" class="tarot-illustration" fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
    <title>${label}</title>
    <defs><clipPath id="${clipId}"><path d="M28 287V131C28 78 65 48 115 48S202 78 202 131V287Z"/></clipPath></defs>
    <rect x=".5" y=".5" width="229" height="359" rx="9" fill="${PAPER}" stroke="${MUTED}"/>
    <rect x="8" y="8" width="214" height="344" rx="5" stroke="${GOLD}" stroke-width=".7"/>
    <rect x="12" y="12" width="206" height="336" rx="3" stroke-width=".5"/>
    <path d="M18 37V19H36M194 19H212V37M18 323V341H36M194 341H212V323" stroke="${GOLD}" stroke-width=".7"/>
    <g stroke="${GOLD}" stroke-width=".65">${star(28, 28, 4)}${star(202, 28, 4)}${star(28, 332, 3)}${star(202, 332, 3)}</g>
    <text x="115" y="34" fill="${INK}" stroke="none" font-family="Georgia, 'Times New Roman', serif" font-size="10" letter-spacing="2" text-anchor="middle">${escape(index)}</text>
    <path d="M24 291V131C24 76 63 44 115 44S206 76 206 131V291Z" stroke="${GOLD}" stroke-width=".65"/>
    <path d="M28 287V131C28 78 65 48 115 48S202 78 202 131V287Z" stroke-width=".8"/>
    <g clip-path="url(#${clipId})">${major !== null ? majorScene(major) : minorScene(card)}</g>
    <path d="M43 301H91M139 301H187" stroke="${GOLD}" stroke-width=".6"/>
    <g stroke="${GOLD}" stroke-width=".65">${star(115, 301, 3)}</g>
    <text x="115" y="319" fill="${INK}" stroke="none" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" letter-spacing="1.5" text-anchor="middle">${escape(title)}</text>
    <text x="115" y="337" fill="${GOLD}" stroke="none" font-family="Georgia, 'Times New Roman', serif" font-size="5.5" letter-spacing="2.5" text-anchor="middle">STELLAR · ARCANA</text>
  </svg>`;
}

/** Ornamental card back; decorative SVG with no external assets. */
export function cardBack(options = {}) {
  const label = escape(options.label || '星间塔罗牌背面');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 360" role="img" aria-label="${label}" class="tarot-illustration tarot-back" fill="none" stroke="${GOLD}" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round">
    <title>${label}</title>
    <rect x=".5" y=".5" width="229" height="359" rx="9" fill="${INK}" stroke="${INK}"/>
    <rect x="8" y="8" width="214" height="344" rx="5"/><rect x="13" y="13" width="204" height="334" rx="3" stroke-width=".4"/>
    <path d="M115 28L201 180 115 332 29 180ZM115 45L191 180 115 315 39 180Z" stroke-width=".55"/>
    <ellipse cx="115" cy="180" rx="69" ry="116" stroke-width=".45"/>
    <ellipse cx="115" cy="180" rx="59" ry="104" stroke-width=".45" stroke-dasharray="1 5"/>
    <circle cx="115" cy="180" r="45"/><circle cx="115" cy="180" r="51" stroke-width=".4"/>
    <path d="M72 180Q115 139 158 180Q115 221 72 180Z"/><circle cx="115" cy="180" r="15"/><circle cx="115" cy="180" r="6" fill="${GOLD}"/>
    ${radial(115, 180, 57, 7, 24)}
    <g stroke="${PAPER}" stroke-width=".6">${star(115, 87, 16, 8, 5)}${star(115, 273, 16, 8, 5)}${star(35, 46, 5)}${star(195, 46, 5)}${star(35, 314, 5)}${star(195, 314, 5)}${star(37, 180, 4)}${star(193, 180, 4)}</g>
    ${crescent(55, 100, 12)}${`<g transform="rotate(180 175 260)">${crescent(175, 260, 12)}</g>`}
    <path d="M43 63L64 77 70 104 86 117M187 297L166 283 160 256 144 243M43 297L64 283 70 256 86 243M187 63L166 77 160 104 144 117" stroke-width=".5"/>
    <g fill="${GOLD}" stroke="none">${circle(43, 63, 1.5)}${circle(64, 77, 1.5)}${circle(70, 104, 1.5)}${circle(86, 117, 1.5)}${circle(187, 297, 1.5)}${circle(166, 283, 1.5)}${circle(160, 256, 1.5)}${circle(144, 243, 1.5)}${circle(43, 297, 1.5)}${circle(64, 283, 1.5)}${circle(70, 256, 1.5)}${circle(86, 243, 1.5)}${circle(187, 63, 1.5)}${circle(166, 77, 1.5)}${circle(160, 104, 1.5)}${circle(144, 117, 1.5)}</g>
    <path d="M25 28H52M25 28V55M205 28H178M205 28V55M25 332H52M25 332V305M205 332H178M205 332V305" stroke-width=".6"/>
  </svg>`;
}
