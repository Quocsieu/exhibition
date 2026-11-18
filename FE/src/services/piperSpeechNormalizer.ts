/**
 * Dedicated Vietnamese speech normalization & natural clause chunking for Browser Piper WASM
 * (`vi_VN-vais1000-medium`).
 *
 * Strictly separates:
 * - `displayText`: Original human-readable subtitle with exact brand/product spelling & formatted prices.
 * - `speechText`: Phonetically normalized Vietnamese text for Piper VITS synthesis (never mutates DB/UI).
 */

const VIETNAMESE_DIGITS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
] as const;

function readThreeDigitGroupVi(n: number, isLeadingGroup: boolean): string {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;
  const parts: string[] = [];

  if (hundreds > 0 || !isLeadingGroup) {
    parts.push(`${VIETNAMESE_DIGITS[hundreds]} trăm`);
  }

  if (tens === 0) {
    if (ones > 0) {
      if (hundreds > 0 || !isLeadingGroup) {
        parts.push('lẻ');
      }
      parts.push(VIETNAMESE_DIGITS[ones]);
    }
    return parts.join(' ');
  }

  if (tens === 1) {
    parts.push('mười');
    if (ones === 5) {
      parts.push('lăm');
    } else if (ones > 0) {
      parts.push(VIETNAMESE_DIGITS[ones]);
    }
    return parts.join(' ');
  }

  parts.push(`${VIETNAMESE_DIGITS[tens]} mươi`);
  if (ones === 1) {
    parts.push('mốt');
  } else if (ones === 4) {
    parts.push('tư');
  } else if (ones === 5) {
    parts.push('lăm');
  } else if (ones > 0) {
    parts.push(VIETNAMESE_DIGITS[ones]);
  }

  return parts.join(' ');
}

export function numberToVietnameseWordsClient(rawNumber: number): string {
  if (!Number.isFinite(rawNumber)) return '';
  const isNegative = rawNumber < 0;
  const n = Math.round(Math.abs(rawNumber));
  if (n === 0) return 'không';

  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ'];
  const groups: number[] = [];
  let rem = n;
  while (rem > 0) {
    groups.push(rem % 1000);
    rem = Math.floor(rem / 1000);
  }

  const segments: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const grp = groups[i];
    if (grp === 0) continue;
    const isLeading = segments.length === 0;
    const words = readThreeDigitGroupVi(grp, isLeading);
    const unitLabel = units[i] || '';
    segments.push(unitLabel ? `${words} ${unitLabel}` : words);
  }

  const joined = segments.join(' ').replace(/\s+/g, ' ').trim();
  return isNegative ? `âm ${joined}` : joined;
}

/**
 * Case-sensitive acronyms (matched on exact Unicode word boundaries) so uppercase technical acronyms
 * like `AI`, `AR`, `AC`, `PET` are expanded without ever touching lowercase Vietnamese words (`ai`, `ca`, `in`).
 */
const CASE_SENSITIVE_ACRONYMS: ReadonlyArray< readonly [string, string] > = [
  ['Lithium-LFP', 'li thi um eo ép pi'],
  ['Lithium LFP', 'li thi um eo ép pi'],
  ['PM2.5', 'pi em hai phẩy năm'],
  ['Wi-Fi', 'oai phai'],
  ['WiFi', 'oai phai'],
  ['E-Ink', 'i inh'],
  ['Type-2', 'tai hai'],
  ['Type-C', 'tai xê'],
  ['USB-C', 'u ét bê xê'],
  ['USB', 'u ét bê'],
  ['IoT', 'ai ô ti'],
  ['LiDAR', 'lai đa'],
  ['SLAM', 'xờ lam'],
  ['Modbus', 'mốt bớt'],
  ['RFID', 'a ép ai đi'],
  ['TVOC', 'ti vi ô xi'],
  ['TOPS', 'tóp'],
  ['CO2', 'xê ô hai'],
  ['LFP', 'eo ép pi'],
  ['DoD', 'đi ô đi'],
  ['AMR', 'ây em a'],
  ['NPU', 'en pi u'],
  ['CPU', 'xê pê u'],
  ['GPU', 'di pê u'],
  ['RAM', 'ram'],
  ['SSD', 'ét ét đê'],
  ['CRI', 'xi a ai'],
  ['NRC', 'en a xi'],
  ['FSC', 'ép ét xi'],
  ['SCA', 'ét xi ây'],
  ['TCP', 'ti xi pi'],
  ['PET', 'pét'],
  ['LED', 'lét'],
  ['LCD', 'eo xi đi'],
  ['OLED', 'ô lét'],
  ['JSC', 'giây ét xi'],
  ['AI', 'ây ai'],
  ['AR', 'ây a'],
  ['VR', 'vi a'],
  ['XR', 'ích a'],
  ['AC', 'ây xi'],
  ['DC', 'đi xi'],
  ['PU', 'pê u'],
  ['UV', 'u vê'],
  ['QR', 'quy a'],
  ['3D', 'ba đê'],
  ['4D', 'bốn đê'],
  ['4K', 'bốn ca'],
  ['8K', 'tám ca'],
  ['5G', 'năm di'],
  ['4G', 'bốn di'],
];

/**
 * Case-insensitive English brand stems, product terms & loanwords mapped to natural Vietnamese syllables
 * so `vi_VN-vais1000-medium` (trained on pure Vietnamese phonemes) pronounces them clearly without dropping IPA tokens.
 */
const ENGLISH_PHONETIC_LEXICON: ReadonlyArray< readonly [string, string] > = [
  // Multi-word phrases first
  ['Arabica Honey Process', 'A ra bi ca Hăn ni Pờ rô xét'],
  ['Honey Process', 'Hăn ni Pờ rô xét'],
  ['Standing Desk', 'Xờ ten đinh Đét'],
  ['Drip Box', 'Đờ ríp Bóc'],
  ['Clean Energy', 'Cờ lin Ê nơ di'],
  ['Green Energy', 'Gờ rin Ê nơ di'],
  ['Green Future', 'Gờ rin Phiêu chơ'],
  ['Solar Battery', 'Sô la Bát tơ ri'],
  ['Design Collective', 'Đi dai Cô léc típ'],
  ['Living Studio', 'Li vinh Xờ tu đi ô'],
  ['Tech Lab', 'Tếch Láp'],
  // Individual brand & product stems
  ['AetherSense', 'Ê thơ Xen'],
  ['AetherGlass', 'Ê thơ Gờ lát'],
  ['Aether', 'Ê thơ'],
  ['Technologies', 'Tếch nô lô di'],
  ['Technology', 'Tếch nô lô di'],
  ['Architectural', 'A ki tếc chơ rồ'],
  ['Automation', 'Ô tô mây sần'],
  ['Collective', 'Cô léc típ'],
  ['Interiors', 'In tê ri ơ'],
  ['Specialty', 'Xờ pe sô ti'],
  ['Bluetooth', 'Bờ lu tút'],
  ['PowerWall', 'Pao ơ Uôn'],
  ['ChargeBox', 'Chạc Bóc'],
  ['AirMesh', 'E Mét'],
  ['EyePro', 'Ai Pờ rô'],
  ['EcoVita', 'Ê cô Vi ta'],
  ['Roastery', 'Rô xơ ri'],
  ['Highland', 'Hai lân'],
  ['Robotics', 'Rô bốt tích'],
  ['Acoustic', 'A cu xờ tích'],
  ['Kinetix', 'Ki nê tích'],
  ['Solaris', 'Sô la rít'],
  ['Lumina', 'Lu mi na'],
  ['Nordic', 'No đíc'],
  ['Arabica', 'A ra bi ca'],
  ['Robusta', 'Rô bút ta'],
  ['Caramel', 'ca ra men'],
  ['Anodized', 'a nốt hóa'],
  ['Standing', 'Xờ ten đinh'],
  ['Lighting', 'Lai tinh'],
  ['Wireless', 'Oai lớt'],
  ['Inverter', 'In vơ tơ'],
  ['Battery', 'Bát tơ ri'],
  ['Premium', 'Pờ ri mi um'],
  ['Organic', 'O ga níc'],
  ['Edition', 'Ê đi sần'],
  ['Version', 'Vơ sần'],
  ['Digital', 'Đi di tồ'],
  ['Showroom', 'sâu rum'],
  ['Process', 'Pờ rô xét'],
  ['Charge', 'Chạc'],
  ['Energy', 'Ê nơ di'],
  ['Future', 'Phiêu chơ'],
  ['Hybrid', 'hai bờ rít'],
  ['Linear', 'Li ni ơ'],
  ['Living', 'Li vinh'],
  ['Luxury', 'Lắc xơ ri'],
  ['Module', 'mô đun'],
  ['Motion', 'Mâu sần'],
  ['Office', 'Óp phít'],
  ['Sensor', 'Xen xơ'],
  ['Series', 'Xê ri'],
  ['Server', 'Xơ vơ'],
  ['Studio', 'Xờ tu đi ô'],
  ['System', 'Xít tầm'],
  ['Vision', 'Vi dần'],
  ['Coffee', 'Cóp phi'],
  ['Design', 'Đi dai'],
  ['Global', 'Gờ lô bồ'],
  ['Cobot', 'Cô bốt'],
  ['Craft', 'Cờ ráp'],
  ['Chair', 'Che'],
  ['Cloud', 'Cờ lao'],
  ['Fjäll', 'Phi an'],
  ['Fjall', 'Phi an'],
  ['Glass', 'Gờ lát'],
  ['Green', 'Gờ rin'],
  ['Group', 'Gờ rúp'],
  ['Honey', 'Hăn ni'],
  ['Laser', 'La de'],
  ['Light', 'Lai'],
  ['Micro', ' Mai crô'],
  ['Motor', 'mô tơ'],
  ['Panel', 'Pa nen'],
  ['Phone', 'Phôn'],
  ['Power', 'Pao ơ'],
  ['Robot', 'rô bốt'],
  ['Rover', 'Rô vơ'],
  ['Sense', 'Xen'],
  ['Smart', 'Xờ mát'],
  ['Solar', 'Sô la'],
  ['Sound', 'Xao'],
  ['Space', 'Xờ pây'],
  ['Super', 'Xu pơ'],
  ['Ultra', 'Un tra'],
  ['Watch', 'Oát'],
  ['Audio', 'Au đi ô'],
  ['Clean', 'Cờ lin'],
  ['Desk', 'Đét'],
  ['Drip', 'Đờ ríp'],
  ['Eco', 'Ê cô'],
  ['Ergo', 'Ơ gô'],
  ['Halo', 'Ha lô'],
  ['Home', 'Hôm'],
  ['Lite', 'Lai'],
  ['Mesh', 'Mét'],
  ['Mini', 'Mi ni'],
  ['Nano', 'Na nô'],
  ['Pack', 'Pắc'],
  ['Plus', 'Pờ lớt'],
  ['Tech', 'Tếch'],
  ['Vita', 'Vi ta'],
  ['Wall', 'Uôn'],
  ['Box', 'Bóc'],
  ['Eye', 'Ai'],
  ['Hex', 'Héc'],
  ['Hub', 'Hấp'],
  ['Lab', 'Láp'],
  ['Max', 'Mắc'],
  ['Pro', 'Pờ rô'],
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceBoundedPhrase(text: string, target: string, replacement: string, flags: string): string {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(target)}(?![\\p{L}\\p{N}])`, flags);
  return text.replace(pattern, replacement);
}

/**
 * Normalizes any Vietnamese + English product/booth consultation text into clean, natural-sounding
 * Vietnamese speech text specifically tuned for Piper WASM (`vi_VN-vais1000-medium`).
 *
 * Does NOT modify `displayText` shown in subtitles or Admin database records.
 */
export function normalizeVietnameseForPiper(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\[(?:SKU|Mã|ID)[^\]]*\]/gi, ' ')
    .replace(/\b(undefined|null|NaN)\b/gi, ' ');

  // 1. Expand corporate suffixes cleanly before punctuation splitting
  text = text
    .replace(/\bCorp\.(?=\s|$|[,;)])/g, 'Cóp')
    .replace(/\bLtd\.(?=\s|$|[,;)])/g, 'Li mi tựt')
    .replace(/\bCo\.(?=\s|$|[,;)])/g, 'Căm pa ni');

  // 2. Convert formatted Vietnamese thousand-separated integers (e.g. 590.000đ -> 590000đ, 1.550m -> 1550m, 18.900.000 -> 18900000)
  // Strict rule: leading group starts with 1..9 (never 0.xxx) and every dot group has EXACTLY 3 digits not followed by another digit.
  text = text.replace(/\b([1-9]\d{0,2})((?:\.\d{3})+)(?!\d)/g, (_m, head: string, rest: string) => {
    return `${head}${rest.replace(/\./g, '')}`;
  });
  // Also support comma-grouped English thousands (e.g. 590,000 VND -> 590000 VND)
  text = text.replace(/\b([1-9]\d{0,2})((?:,\d{3})+)(?!\d)/g, (_m, head: string, rest: string) => {
    return `${head}${rest.replace(/,/g, '')}`;
  });

  // 3. Currency symbols & codes attached to numbers
  text = text
    .replace(/\$\s*(\d+(?:\.\d+)?)/g, '$1 đô la Mỹ')
    .replace(/(\d)\s*(?:đồng|VNĐ|VND|₫)\b/gi, '$1 đồng')
    .replace(/(\d)\s*đ(?![\p{L}\p{N}])/gu, '$1 đồng')
    .replace(/(\d)\s*USD\b/gi, '$1 đô la Mỹ');

  // 4. Special ranges, ratios, comparisons, and symbols
  text = text
    .replace(/±\s*(?=\d)/g, 'cộng trừ ')
    .replace(/<\s*(?=\d)/g, 'dưới ')
    .replace(/>\s*(?=\d)/g, 'trên ')
    .replace(/[<>]/g, ' ')
    .replace(/\b(\d+)\s*-\s*trong\s*-\s*(\d+)\b/gi, '$1 trong $2')
    .replace(/\b24\s*\/\s*7\b/g, 'hai tư trên bảy')
    .replace(/(\d)\s*(sản phẩm|lượt|vòng|chiếc|gói|mẫu)\s*\/\s*(phút|giây|giờ|ngày)\b/gi, '$1 $2 trên $3')
    .replace(/\bkm\s*\/\s*h\b/gi, 'ki lô mét trên giờ')
    .replace(/\bm\s*\/\s*s\b/gi, 'mét trên giây')
    .replace(/\b(\d{4})\s*K\s*[–—-]\s*(\d{4})\s*K\b/g, '$1 độ ca đến $2 độ ca')
    .replace(/\b(\d{4})\s*K\b/g, '$1 độ ca')
    .replace(/\bCRI\s*(\d+)\s*\+/g, 'xi a ai $1 cộng')
    .replace(/(\d)\s*\+(?=\s|$|[,.;)])/g, '$1 cộng')
    .replace(/(\p{L})\s*\/\s*(\p{L})/gu, '$1 và $2')
    .replace(/&/g, ' và ');

  // 5. Case-sensitive technical acronyms BEFORE splitting or lowercasing (`AI` -> `ây ai`, `5G` -> `năm gi`, `PM2.5` -> `pi em hai phẩy năm`)
  for (const [acronym, spoken] of CASE_SENSITIVE_ACRONYMS) {
    text = replaceBoundedPhrase(text, acronym, spoken, 'gu');
  }
  // Alphanumeric protection codes like IP65, IP67, IP68, EN-1335, AMR-200, X1
  text = text
    .replace(/\bIP\s*(\d{2})\b/g, 'ai pi $1')
    .replace(/\bEN-(\d+)\b/g, 'i en $1')
    .replace(/\bB1\b/g, 'bê một')
    .replace(/\bX(\d+)\b/g, 'ích $1');

  // 6. Measurement units (strictly context-bound to numbers where unit letter could be ambiguous!)
  text = text
    .replace(/(\d)\s*%/g, '$1 phần trăm')
    .replace(/°\s*C\b/gi, ' độ xê')
    .replace(/(\d)\s*m(?:2|²)\b/gi, '$1 mét vuông')
    .replace(/\bm(?:2|²)\b/gi, ' mét vuông')
    .replace(/(\d)\s*m(?:3|³)\b/gi, '$1 mét khối')
    .replace(/(\d)\s*kWh\b/gi, '$1 ki lô oát giờ')
    .replace(/\bkWh\b/gi, ' ki lô oát giờ')
    .replace(/(\d)\s*kW\b/gi, '$1 ki lô oát')
    .replace(/\bkW\b/gi, ' ki lô oát')
    .replace(/(\d)\s*Wh\b/g, '$1 oát giờ')
    .replace(/(\d)\s*W\b/g, '$1 oát')
    .replace(/(\d)\s*mAh\b/gi, '$1 mi li am pe giờ')
    .replace(/\bmAh\b/gi, ' mi li am pe giờ')
    .replace(/(\d)\s*GHz\b/gi, '$1 gi ga héc')
    .replace(/(\d)\s*MHz\b/gi, '$1 mê ga héc')
    .replace(/(\d)\s*Hz\b/gi, '$1 héc')
    .replace(/(\d)\s*kg\b/gi, '$1 ki lô gam')
    .replace(/\bkg\b/gi, ' ki lô gam')
    .replace(/(\d)\s*mg\b/gi, '$1 mi li gam')
    .replace(/(\d)\s*g\b/g, '$1 gam')
    .replace(/(\d)\s*km\b/gi, '$1 ki lô mét')
    .replace(/(\d)\s*mm\b/gi, '$1 mi li mét')
    .replace(/(\d)\s*cm\b/gi, '$1 xăng ti mét')
    .replace(/(\d)\s*m\b/g, '$1 mét')
    .replace(/(\d)\s*dB\b/gi, '$1 đê xi ben');

  // 7. Split CamelCase compounds (e.g. SolarMax -> Solar Max, PowerWall -> Power Wall) so even newly added Admin brands match stems cleanly
  text = text.replace(/([a-z]{2,})([A-Z][a-z])/g, '$1 $2');

  // 8. Apply curated English -> Vietnamese phonetic lexicon (longest phrases first, strict word boundaries)
  for (const [eng, viPhonetic] of ENGLISH_PHONETIC_LEXICON) {
    text = replaceBoundedPhrase(text, eng, viPhonetic, 'giu');
  }

  // 9. Parentheses & dashes -> natural comma pause; separate remaining letter+digit boundaries
  text = text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s*\(\s*/g, ', ')
    .replace(/\s*\)\s*/g, ', ')
    .replace(/([A-Za-zÀ-ỹ])-(\d)/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');

  // 10. Expand decimals (both dot `98.4` and comma `98,4` with 1..2 frac digits or `0.xxx`) BEFORE integers
  text = text.replace(/\b(\d{1,9})[.,](\d{1,4})\b/g, (_m, intPart: string, fracPart: string) => {
    const intWords = numberToVietnameseWordsClient(Number(intPart));
    const strippedFrac = fracPart.replace(/^0+/, '');
    let fracWords = '';
    if (!strippedFrac) {
      fracWords = 'không';
    } else if (fracPart.startsWith('0')) {
      const leadingZeros = 'không '.repeat(fracPart.length - strippedFrac.length).trim();
      fracWords = `${leadingZeros} ${numberToVietnameseWordsClient(Number(strippedFrac))}`.trim();
    } else {
      fracWords = numberToVietnameseWordsClient(Number(fracPart));
    }
    return `${intWords} phẩy ${fracWords}`;
  });

  // 11. Expand all remaining integers up to 12 digits into natural Vietnamese words
  text = text.replace(/\b\d{1,12}\b/g, (numStr) => {
    const n = Number(numStr);
    return Number.isFinite(n) ? numberToVietnameseWordsClient(n) : numStr;
  });

  // 12. Clean punctuation spacing so Piper's prosody pauses naturally
  text = text
    .replace(/!/g, '.')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (text && !/[.!?]$/.test(text)) {
    text = `${text}.`;
  }
  return text;
}

const NBSP = '\u00A0';

/**
 * Splits normalized Vietnamese speech into natural clauses (`targetMin = 65` .. `targetMax = 135` chars)
 * for low-latency first-chunk playback & background lookahead scheduling in Piper WASM,
 * without cutting mid-word, mid-number/price, or mid-unit.
 */
export function chunkNormalizedSpeechForPiper(
  normalizedSpeech: string,
  targetMin = 65,
  targetMax = 135
): string[] {
  const clean = (normalizedSpeech || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= targetMax) return [clean];

  // Protect spoken Vietnamese number + unit / currency spans from ever splitting across chunks
  const guarded = clean.replace(
    /\b(?:(?:không|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|mươi|mốt|lăm|tư|lẻ|trăm|nghìn|triệu|tỷ|phẩy)\s+){1,10}(?:đồng|đô\s+la\s+Mỹ|ki\s+lô\s+oát\s+giờ|ki\s+lô\s+oát|oát\s+giờ|oát|mi\s+li\s+am\s+pe\s+giờ|ki\s+lô\s+gam|mi\s+li\s+gam|gam|ki\s+lô\s+mét|xăng\s+ti\s+mét|mi\s+li\s+mét|mét\s+vuông|mét\s+khối|mét|đê\s+xi\s+ben|độ\s+ca|độ\s+xê|phần\s+trăm|chu\s+kỳ|sản\s+phẩm)\b/gi,
    (m) => m.replace(/\s+/g, NBSP)
  );

  const restore = (s: string): string =>
    s
      .replace(new RegExp(NBSP, 'g'), ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const sentences = guarded
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const pieces: string[] = [];
  const minBreak = Math.floor(targetMin * 0.65);

  for (const sent of sentences) {
    if (sent.length <= targetMax) {
      pieces.push(sent);
      continue;
    }

    let rem = sent;
    while (rem.length > targetMax) {
      const windowEnd = Math.min(rem.length, targetMax);
      const slice = rem.slice(0, windowEnd);
      let splitAt = -1;

      const semi = slice.lastIndexOf('; ');
      const comma = slice.lastIndexOf(', ');
      if (semi >= minBreak) {
        splitAt = semi + 1;
      } else if (comma >= minBreak) {
        splitAt = comma + 1;
      } else {
        const connectors = [
          ' thuộc thương hiệu ',
          ' chuyên về ',
          ' hiện có mức giá ',
          ' tích hợp ',
          ' hỗ trợ ',
          ' giúp ',
          ' cùng ',
          ' và ',
          ' hoặc ',
        ];
        for (const conn of connectors) {
          const idx = slice.lastIndexOf(conn);
          if (idx >= minBreak) {
            splitAt = idx;
            break;
          }
        }
      }

      if (splitAt === -1) {
        const sp = slice.lastIndexOf(' ');
        if (sp >= minBreak) {
          splitAt = sp;
        } else {
          const nextSp = rem.indexOf(' ', windowEnd);
          splitAt = nextSp !== -1 ? nextSp : rem.length;
        }
      }

      const head = rem.slice(0, splitAt).trim();
      if (head) pieces.push(head);
      rem = rem.slice(splitAt).trim();
    }
    if (rem) pieces.push(rem);
  }

  const merged: string[] = [];
  for (const p of pieces) {
    const r = restore(p);
    if (!r) continue;
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (
        (prev.length < 44 && prev.length + 1 + r.length <= targetMax + 20) ||
        (r.length < 34 && prev.length + 1 + r.length <= targetMax + 24)
      ) {
        merged[merged.length - 1] = `${prev} ${r}`.replace(/\s+/g, ' ').trim();
        continue;
      }
    }
    merged.push(r);
  }

  return merged.map((seg) => {
    const trimmed = seg.replace(/[,;:\s]+$/, '').trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  });
}
