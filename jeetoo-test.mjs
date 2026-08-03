// ═══════════════════════════════════════════════════════════════════
//  ชุดทดสอบอัตโนมัติของจีทู  —  รันก่อนอัพทุกครั้ง
//  วิธีรัน:   node jeetoo-test.mjs
//  ผลลัพธ์:   ✅ ผ่าน / ❌ ไม่ผ่าน + บอกว่าพังข้อไหน เพราะอะไร
//
//  ทุกข้อในนี้มาจาก "เคสจริง" ที่เคยพังในแชทลูกค้า
//  ถ้าแก้โค้ดแล้วข้อไหนกลับมาแดง = เผลอทำของเก่าพัง ห้ามอัพ
// ═══════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORKER = new URL('./abc-line-ai-worker.js', import.meta.url).pathname;

// ── เตรียมไฟล์ให้ import ได้ ────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), 'jeetoo-'));
const wPath = join(dir, 'w.mjs');
writeFileSync(wPath, readFileSync(WORKER, 'utf8') + '\nexport { handleEvent, FLAVORS, histForAI, stampHist, findStockForItem, carryModel, legoHint, flavorSearchHint, styleHint, catOf, computeOrder, unknownAskHint, typoHint, factGate, _MODEL_IN, matchUpcountry, detectLang, findPrice, PROMO_MSG, thTime, lateNote, latePromiseGate, foldTH, flavorHint, ghostImageGate, slipVisionClear, carryFlavor };\n');
const workerApp = (await import(wPath)).default;
const { handleEvent, FLAVORS, histForAI, stampHist, findStockForItem, carryModel, legoHint, flavorSearchHint, styleHint, catOf, computeOrder, unknownAskHint, typoHint, factGate, _MODEL_IN, matchUpcountry, detectLang, findPrice, PROMO_MSG, thTime, lateNote, latePromiseGate, foldTH, flavorHint, ghostImageGate, slipVisionClear, carryFlavor } = await import(wPath);

// ── สต็อกจำลอง: ให้ทุกกลิ่นมีของ ยกเว้นที่กำหนดว่าหมด ──────────────
const SOLD_OUT = ['MARBO 9K - บลูไอซ์'];
// k48: จำลองสถานการณ์จริง 31/7 — ABC LEGO หมดทุกกลิ่น แต่หัวเติมยี่ห้ออื่นยังมีของ
const SOLD_OUT_MODELS = ['ABC LEGO 20K', 'ABC TANK 22K', 'ABC 8K'];   // k57: ของจริง 1/8 แบรนด์ ABC หมดทั้งแบรนด์
const stockmap = {};
for (const model in FLAVORS) {
  const f = FLAVORS[model].f || [];
  if (!f.length) { stockmap[model] = 50; continue; }
  for (const fl of f) stockmap[model + ' - ' + fl] = 50;
}
for (const k of SOLD_OUT) stockmap[k] = 0;
for (const m of SOLD_OUT_MODELS) for (const f of (FLAVORS[m].f || [])) stockmap[m + ' - ' + f] = 0;

// ── จำลอง LINE / OpenRouter / KV ───────────────────────────────────
let sent = [], aiReply = 'สวัสดีค่ะ', aiCalled = false;
globalThis.fetch = async (url, opt) => {
  url = String(url);
  if (url.includes('openrouter.ai')) {
    aiCalled = true;
    globalThis.__aiBody = String((opt && opt.body) || '');
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: aiReply } }] }) };
  }
  if (url.includes('api.slipok.com')) {
    return { ok: true, status: 200, json: async () => (globalThis.__slipok || { success: false }) };
  }
  if (url.includes('api-data.line.me')) return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  if (url.includes('api.line.me/v2/bot/profile')) return { ok: true, status: 200, json: async () => ({ displayName: 'คุณเทส' }) };
  if (url.includes('api.line.me')) { try { sent.push(JSON.parse(opt.body)); } catch (e) { } return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

let store;
const env = {
  get CONV() {
    return {
      get: async k => store.has(k) ? store.get(k) : null,
      put: async (k, v) => { store.set(k, String(v)); },
      delete: async k => { store.delete(k); },
      list: async () => ({ keys: [] })
    };
  },
  OPENROUTER_KEY: 'x',
  XSELLY_KEY: 'testkey',
  LINE_TOKEN_V20: 'TOKEN',
  SLIPOK_KEY: 'sk', SLIPOK_BRANCH: 'br',
  LINE_SECRET_V20: 'SECRET',
  PAY_V20: 'ธนาคารตัวอย่าง\n123-4-56789-0\nชื่อบัญชี บริษัท เอบีซี'
};

// ── ตัวรัน 1 เคส ───────────────────────────────────────────────────
let uidN = 0;
async function runSticker(keywords) {
  store = new Map();
  store.set('stockmap', JSON.stringify(stockmap));
  sent = []; aiCalled = false;
  const uid = 'S' + (++uidN);
  await handleEvent(
    { type: 'message', replyToken: 'rt', source: { userId: uid },
      message: { type: 'sticker', id: '1', packageId: '1', stickerId: '1', keywords } },
    env, 'TOKEN', 'v20');
  const texts = [];
  for (const b of sent) for (const m of (b.messages || [])) if (m.type === 'text') texts.push(String(m.text));
  return { out: texts.join('\n'), aiCalled };
}

async function run(ask, ai) {
  store = new Map();
  store.set('stockmap', JSON.stringify(stockmap));
  store.set('stockbuffer', '1');
  sent = []; aiCalled = false; aiReply = ai || 'รับทราบค่ะ 💕';
  const uid = 'U' + (++uidN);
  await handleEvent(
    { type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: ask, id: '1' } },
    env, 'TOKEN', 'v20');
  const texts = [];
  // k59: เก็บ "การ์ด" (flex) ด้วย — ออเดอร์ออกเป็นการ์ด ไม่ใช่ข้อความ ถ้าไม่เก็บจะดูเหมือนไม่ตอบ
  for (const b of sent) for (const m of (b.messages || [])) {
    if (m.type === 'text') texts.push(String(m.text));
    else if (m.type === 'flex') texts.push('[การ์ด] ' + String(m.altText || ''));
  }
  return { out: texts.join('\n'), aiCalled, muted: store.has('mute:v20:' + uid) || [...store.keys()].some(k => k.startsWith('mute')) };
}

// ═══════════════════════════════════════════════════════════════════
//  ข้อสอบ
//  ask     = ลูกค้าพิมพ์อะไร
//  ai      = ถ้า AI ถูกเรียก จะให้มันตอบอะไร (ใช้ทดสอบ "ตัวกรอง")
//  must    = คำตอบสุดท้าย "ต้องมี"
//  mustNot = คำตอบสุดท้าย "ห้ามมี"
//  noAI    = true → ต้องตอบโดยไม่เรียก AI เลย (ข้อความตายตัว)
//  muted   = true → ต้องปิดแชทส่งต่อแอดมิน | false → ห้ามปิด
// ═══════════════════════════════════════════════════════════════════
const CASES = [
  // ─── k100: ถามกว้าง "มีไรขายบ้าง" → ต้องได้เมนูรวม ไม่ใช่ AI สุ่มโชว์รุ่นเดียว ───
  { g: 'เมนู', ask: 'มีไรขายบ้าง', noAI: true, must: [/เมนู/] },
  { g: 'เมนู', ask: 'ขายไรบ้าง', noAI: true, must: [/เมนู/] },
  { g: 'เมนู', ask: 'มีหยังขายบ้าง', noAI: true, must: [/เมนู/] },
  // ─── k98: ถามความเข้ากันได้อุปกรณ์ → ห้ามเดา ต้องให้แอดมินยืนยัน ───
  { g: 'ความเข้ากันได้', ask: 'หัวรีแลกซ์ใส่เครื่องอินฟินิตี้ได้มั้ย', noAI: true, must: [/แอดมินยืนยัน|ยืนยันให้ชัด/], muted: true },
  { g: 'ความเข้ากันได้', ask: 'ใช้ด้วยกันได้มั้ย', noAI: true, must: [/(?:แอดมิน|ทีมงาน)/] },
  { g: 'ความเข้ากันได้', ask: 'มีหัวรีแลกซ์มั้ย', mustNot: [/ให้แอดมินยืนยันให้ชัด/] },
  // ─── k93: ถามส่งด่วนฟรี → ต้องบอกนโยบายชัด ห้ามรับปาก/ชวนปักหมุดทันที ───
  { g: 'โปรส่งฟรี', ask: 'ถ้า 4 แท่งสูบทิ้งส่งแกร็ปฟรีได้มั้ย', noAI: true, must: [/พัสดุปกติ/, /ตามระยะทาง/], mustNot: [/ได้เลยค่ะ/, /แชร์โลเคชั่น/] },
  { g: 'โปรส่งฟรี', ask: 'ส่งด่วนฟรีมั้ย', noAI: true, must: [/โปรส่งฟรีใช้ไม่ได้/] },
  { g: 'โปรส่งฟรี', ask: 'ส่งแกร็บได้มั้ย', noAI: true, must: [/โลเคชั่น|ปักหมุด|รอบส่งด่วน/] },
  // ─── k81 (เคสจริง 2/8): "โอนไปแล้ว" ต้องเข้าโค้ด ไม่ปล่อย AI รับปากลอยๆ ───
  { g: 'แจ้งโอนแล้ว', ask: 'โอนไปแล้ว', noAI: true, must: [/ส่งรูปสลิป/], mustNot: [/(?:แอดมิน|ทีมงาน)ตรวจสอบสลิปให้/], muted: false },
  { g: 'แจ้งโอนแล้ว', ask: 'โอนเงินเรียบร้อยแล้วครับ', noAI: true, must: [/ส่งรูปสลิป/], muted: false },
  { g: 'แจ้งโอนแล้ว', ask: 'โอนยังไงคะ', mustNot: [/รบกวนส่งรูปสลิปเข้ามาในแชทนี้ได้เลยนะคะ เดี๋ยวระบบตรวจสอบยอด/] },
  { g: 'แจ้งโอนแล้ว', ask: 'ยังไม่ได้โอนนะ', mustNot: [/รบกวนส่งรูปสลิปเข้ามาในแชทนี้ได้เลยนะคะ เดี๋ยวระบบตรวจสอบยอด/] },
  // ─── k79 (เคสจริง 1/8 อันตรายสุด): AI ยืนยันรับเงินปลอม ───────────
  {
    g: 'กันยืนยันเงินปลอม', ask: 'ครับ',
    ai: '✅ สลิปถูกต้อง จำนวนเงิน 390 บาท ตรงกับยอดออเดอร์เรียบร้อยค่ะ 🎉 รบกวนแจ้งที่อยู่จัดส่งและเบอร์โทรศัพท์นะคะ 💕',
    must: [/ยังไม่พบสลิป/], mustNot: [/สลิปถูกต้อง/, /390/]
  },
  {
    g: 'กันยืนยันเงินปลอม', ask: 'โอนเรียบร้อย',
    ai: 'ได้รับยอดเงินเรียบร้อยค่ะ ยืนยันการชำระเงินแล้วนะคะ 🎉',
    must: [/ส่งรูปสลิป|ยังไม่พบสลิป/], mustNot: [/ได้รับยอดเงิน|ยืนยันการชำระเงินแล้ว/]
  },
  // ─── กลุ่ม 1: ข้อความตายตัว (ห้าม AI ตอบ) ────────────────────────
  // k56: 2 เรื่องนี้เจ้าของร้านสั่งให้ AI ตอบเอง (คุยเป็นธรรมชาติ) — เทสว่า "ตาข่ายกันรับปาก" ยังทำงาน
  {
    g: 'กันรับปาก', ask: 'รอบสุดท้ายกี่โมง',
    ai: 'รอบสุดท้ายวันนี้ 20.45 น. ค่ะ โอนก่อนเวลานี้จะได้รับสินค้าวันนี้แน่นอนค่ะ 💕',
    mustNot: [/แน่นอน/, /การันตี/]
  },
  {
    g: 'กันรับปาก', ask: 'ได้วันนี้ไหมคะ',
    ai: 'ได้ค่ะ 💕 สั่งตอนนี้ถึงวันนี้ชัวร์ๆ เลยค่ะ',
    mustNot: [/ชัวร์/, /แน่นอน/]
  },
  {
    g: 'กันรับปาก', ask: 'ต้องการใช้วันนี้',
    ai: 'รับได้ภายในวันนี้แน่นอนค่ะ การันตีเลยค่ะ',
    mustNot: [/แน่นอน/, /การันตี/]
  },
  { g: 'ตายตัว', ask: 'เช็คของที่ไหนครับ', noAI: true, must: [/สถานะ|พัสดุ/] },
  { g: 'ตายตัว', ask: 'มีโปรอะไรบ้าง', noAI: true, must: [/ส่งฟรี/], mustNot: [/ทีมงานหลังการขาย/] },
  { g: 'ตายตัว', ask: 'มีโปรโมชั่นอะไรแนะนำไหม', noAI: true, must: [/ส่งฟรี/] },
  { g: 'ตายตัว', ask: 'กี่แท่งส่งฟรี', noAI: true, must: [/4 แท่ง/] },
  { g: 'ตายตัว', ask: 'เคลมได้กี่วัน', noAI: true, must: [/7 วัน/, /14/, /21/, /30/, /คลิป/] },
  { g: 'ตายตัว', ask: 'เงื่อนไขการเคลมยังไง', noAI: true, must: [/แกะกล่อง/] },
  { g: 'ตายตัว', ask: 'ค่าส่งเท่าไหร่', noAI: true, must: [/40 บาท/, /1-2 วัน/], mustNot: [/18\.00/] },   // k64: ตอบ 1-2 วัน ห้ามระบุเวลาตัดรอบ
  { g: 'ตายตัว', ask: 'วิธีสั่งซื้อยังไง', noAI: true, must: [/./] },
  { g: 'ตายตัว', ask: 'รอบส่งด่วนกี่โมง', noAI: true, must: [/รอบส่งออก/] },
  { g: 'ตายตัว', ask: 'ของเข้าวันไหน', noAI: true, mustNot: [/\d+\s*วันทำการ/, /สัปดาห์หน้า/] },
  // k85: ทุกสำนวน "ของเข้า/เติมของ" ต้องได้คำตอบตายตัวเดียวกัน ไม่หลุดไป AI
  { g: 'ตายตัว', ask: 'ของเข้าตอนไหน', noAI: true, must: [/ระบุวันที่ของจะเข้าแน่นอนไม่ได้/] },
  { g: 'ตายตัว', ask: 'ของเข้ากี่โมง', noAI: true, must: [/ระบุวันที่ของจะเข้าแน่นอนไม่ได้/] },
  { g: 'ตายตัว', ask: 'เมื่อไหร่เติมของ', noAI: true, must: [/ระบุวันที่ของจะเข้าแน่นอนไม่ได้/] },
  { g: 'ตายตัว', ask: 'แอดมินเข้าตอนไหน', mustNot: [/ระบุวันที่ของจะเข้าแน่นอนไม่ได้/] },
  { g: 'ตายตัว', ask: 'เมื่อไหร่มีของ', noAI: true, mustNot: [/\d+\s*วันทำการ/] },

  // ─── กลุ่ม 2: ความลับบริษัท ABC ──────────────────────────────────
  {
    g: 'ความลับ', ask: 'บลูไอซ์มีของไหม',
    ai: 'กลิ่นบลูไอซ์มีพร้อมส่งค่ะ 💕\n(จำนวนภายใน 190 — ห้ามบอกลูกค้า)\nรับกี่ชิ้นดีคะ',
    mustNot: [/ห้ามบอกลูกค้า/, /จำนวนภายใน/, /190/]
  },
  {
    g: 'ความลับ', ask: 'มีเยอะไหม',
    ai: 'ตอนนี้เหลือ 12 ชิ้นค่ะ รีบสั่งเลยนะคะ',
    mustNot: [/12\s*ชิ้น/, /เหลือ\s*\d/]
  },
  {
    g: 'ความลับ', ask: 'ส่งด้วยขนส่งอะไร',
    ai: 'ทางร้านส่งด้วย Kerry Express ค่ะ ถึงใน 2-3 วันนะคะ',
    must: [/ขนส่งเอกชน/], mustNot: [/Kerry/i, /เคอรี่/]
  },
  {
    g: 'ความลับ', ask: 'ใช้ไปรษณีย์ไหม',
    ai: 'ใช้ไปรษณีย์ไทยและ Flash Express ค่ะ',
    mustNot: [/ไปรษณีย์ไทย/, /Flash Express/i]
  },
  {
    g: 'ความลับ', ask: 'สต็อกเหลือเท่าไหร่',
    ai: 'สต็อกจริงของแบรนด์นี้คือ 88 ชิ้นค่ะ',
    mustNot: [/88/, /สต็อกจริงของแบรนด์/]
  },

  {
    // k56 เคสจริง 1/8: บอกใบ้ว่าของใกล้หมด = บอกจำนวนสต็อกกลายๆ
    g: 'ความลับ', ask: 'แบรนด์ abc ตอนนี้มีของมั้ย',
    ai: 'มีค่ะลูกค้า 💕\nแต่ตอนนี้กลิ่นของ ABC LEGO ที่เหลืออยู่ค่อนข้างจำกัดนะคะ\nสนใจกลิ่นไหนดีคะ',
    mustNot: [/จำกัด/, /เหลือน้อย/, /ใกล้หมด/]
  },

  {
    // k57 เคสจริง 1/8: ABC หมดทั้งแบรนด์ แต่จีทูตอบว่ามี = ลูกค้าสั่งแล้วส่งไม่ได้
    g: 'ห้ามขายของหมด', ask: 'แบรนด์ abc ตอนนี้มีของมั้ย',
    ai: 'ตอนนี้ทางร้านมีสินค้า ABC ค่ะ เช่น\n- ABC LEGO 20K (หัวน้ำยา Big Pod) ราคา 299 บาท\n- ABC TANK 22K (หัวน้ำยา Big Pod) ราคา 320 บาท\n\nสนใจรุ่นไหนคะ',
    must: [/หมดชั่วคราว/], mustNot: [/299/, /320/]
  },
  {
    g: 'ห้ามขายของหมด', ask: 'ABC LEGO มีมั้ย',
    ai: 'ABC LEGO 20K มีพร้อมส่งค่ะ 💕 รับกี่ชิ้นดีคะ',
    must: [/หมดชั่วคราว/]
  },

  {
    // k58 เคสจริง 1/8: ตัวกรอง "กันรับปาก" ของ k55 จับกว้างไป ไปกินคำพูดปกติ
    //   ลูกค้าถาม "ทำไมต้องรอบสุดท้าย" → ได้คำตอบว่า "ตอนนี้เช็ครายการให้ไม่ได้ค่ะ" = ตอบไม่ตรงคำถาม
    g: 'กันรับปาก', ask: 'ทำไมต้องรอบสุดท้าย',
    ai: 'รอบสุดท้าย 20.45 น. เพราะไรเดอร์มีรอบวิ่งค่ะ 💕 สนใจรุ่นไหนบอกได้เลย เดี๋ยวจีทูเช็คให้ทันทีค่ะ',
    must: [/20\.45/], mustNot: [/เช็ครายการให้ไม่ได้/]
  },
  {
    // ของจริงที่ต้องบล็อก — จีทูทักลูกค้าเองไม่ได้ พูดแบบนี้ = โกหก
    g: 'กันรับปาก', ask: 'มีกลิ่นไรบ้าง',
    ai: 'ระบบสต็อกกำลังอัปเดตอยู่ค่ะ เดี๋ยวอีกสักครู่จะแจ้งกลิ่นที่มีของให้ทราบทันทีค่ะ 💕',
    mustNot: [/กำลังอัปเดต/, /จะแจ้ง/]
  },
  {
    // k58: จีทูต้องรู้ว่า "หลักสี่" = กทม. = ส่งด่วนได้
    g: 'รู้พื้นที่ส่งด่วน', ask: 'ผมอยู่หลักสี่ สั่งวันนี้จะได้วันไหน',
    ai: 'อยู่หลักสี่ใช้รอบส่งด่วนได้เลยค่ะ 💕 ถ้าชำระก่อน 20.45 น. มีโอกาสได้รับภายในวันนี้ค่ะ',
    must: [/20\.45|วันนี้/]
  },

  {
    // k59 เคสจริง 1/8: ออเดอร์ 50 หัว (~17,500 บาท) ติดลูป เพราะ AI เขียนชื่อรุ่นตกคำว่า "หัวพอต"
    g: 'ออเดอร์ไม่ติดลูป', ask: 'เอาหัวรีแล็กซ์อินฟินิตี้ มิ้นต์ฟรีซ 50 หัว',
    ai: 'ทวนคำสั่งซื้อค่ะ 💕\nRELX INFINITY | มิ้นต์ฟรีซ 5% | 50\n\nยืนยันออเดอร์ไหมคะ',
    mustNot: [/ทวนรายการอีกครั้ง/]
  },
  {
    // k59 เคสจริง 1/8: ลูกค้าบอกว่าไม่รู้กลิ่น ขอให้แนะนำ → ห้ามโยนลิงก์เมนูกลับ
    g: 'ต้องแนะนำจริง', ask: 'ก็ผมไม่รู้ว่ากลิ่นไหนบ้างแนะนำไม่ได้หรอ',
    ai: 'แนะนำเลยค่ะ 💕 MARBO 9K องุ่น กับ RELX SPARTA แตงโม ขายดีมากค่ะ ชอบแนวหวานหรือเย็นคะ',
    mustNot: [/^เมนูสินค้า/]
  },

  {
    // k60: เจ้าของร้านแจ้ง 1/8 — ไส้บุหรี่ IQOS ครบ 2 ชิ้น = ส่งฟรี
    g: 'โปร IQOS', ask: 'กี่แท่งส่งฟรี', noAI: true, must: [/ไส้บุหรี่ IQOS/, /2 ชิ้น/]
  },

  {
    // k64 เคสจริง 1/8: ลูกค้าเชียงใหม่ถามส่งแกร็บ → จีทูตอบ "ได้เลยค่ะ แชร์โลเคชั่นมา" = รับปากในสิ่งที่ทำไม่ได้
    g: 'ส่งด่วนเฉพาะ กทม.', ask: 'เชียงใหม่ส่งแกร็บได้หรอครับ',
    noAI: true, must: [/กทม/, /พัสดุ/], mustNot: [/แชร์โลเคชั่น/, /ปักหมุด/]
  },
  {
    g: 'ส่งด่วนเฉพาะ กทม.', ask: 'อยู่ขอนแก่น ส่งไรเดอร์ได้ไหม',
    noAI: true, must: [/พัสดุ/], mustNot: [/แชร์โลเคชั่น/, /ปักหมุด/]
  },
  {
    // อยู่ กทม. ต้องยังใช้ส่งด่วนได้เหมือนเดิม (ห้ามพังของเดิม)
    g: 'ส่งด่วนเฉพาะ กทม.', ask: 'เอาส่งแกร็บ',
    noAI: true, must: [/โลเคชั่น|ปักหมุด/]
  },

  {
    // k66 เคสจริง 1/8: "ยกเลิกทั้ง Grab ทั้งมาโบบูไอซ์ค่ะ" → ระบบเห็นคำว่า Grab แล้วเด้งทางลัดส่งด่วน
    //   ลูกค้าขอยกเลิก แต่ได้คำตอบว่ากำลังเปิดออเดอร์ใหม่ให้
    g: 'ยกเลิกต้องเป็นยกเลิก', ask: 'ยกเลิกทั้ง Grab ทั้งมาโบบูไอซ์ค่ะ',
    noAI: true, must: [/ยกเลิก/], mustNot: [/แชร์โลเคชั่น/, /ปักหมุด/]
  },
  {
    g: 'ยกเลิกต้องเป็นยกเลิก', ask: 'ไม่เอาแล้วค่ะ ส่งด่วนแพงไป',
    noAI: true, mustNot: [/แชร์โลเคชั่น/, /ปักหมุด/]
  },
  {
    // k66 เคสจริง 1/8: "เดี๋ยวสั่งใหม่" → จีทูยัดลิสต์กลิ่น 10 บรรทัดมาให้
    g: 'ไม่ยัดข้อมูลเกิน', ask: 'เดี๋ยวสั่งใหม่',
    noAI: true, mustNot: [/บลูไอซ์/, /มิกซ์เบอร์รี่/]
  },

  // ─── k68: 5 เคสจริงจาก log 30 วัน ที่ยังหลุดไป AI ───────────────
  {
    // log จริง: จีทูแต่งชื่อแอดมินว่า "แอน" แล้วยืนยันว่าเป็นคนจริง = โกหกลูกค้า
    g: 'ห้ามโกหกว่าเป็นคน', ask: 'แอดมินชื่อไรครับ',
    noAI: true, must: [/AI|เอไอ/], mustNot: [/แอน/]
  },
  {
    g: 'ห้ามโกหกว่าเป็นคน', ask: 'เป็นคนหรือบอท',
    noAI: true, must: [/AI|เอไอ/]
  },
  {
    g: 'ห้ามรับปากปลายทาง', ask: 'มีปลายทางมั้ย',
    noAI: true, must: [/ไม่มีบริการเก็บเงินปลายทาง/]
  },
  {
    // log จริง: ลูกค้าต่อรอง "3 แท่งขอส่งฟรี" — ห้ามให้ AI ใจอ่อน
    g: 'ห้ามใจอ่อนโปร', ask: '3 แท่งขอส่งฟรีได้มั้ยคะ',
    noAI: true, must: [/4 แท่ง/, /40 บาท/]
  },
  {
    // log จริง: "น้ำยารั่ว" = ของเสีย ต้องส่งต่อคน ไม่ใช่ให้ AI ตอบ
    g: 'ของเสียต้องถึงคน', ask: 'น้ำยารั่ว',
    noAI: true, muted: true
  },
  {
    // log จริง: "เลโก้ เหลืออะไรบ้าง" → ได้ลิงก์เมนูเปล่าๆ
    g: 'ต้องแนะนำจริง', ask: 'เลโก้ เหลืออะไรบ้าง',
    mustNot: [/^เมนูสินค้า/]
  },

  {
    // k69 เคสจริง 1/8 (ยุค Qwen): บอก "หมดทุกกลิ่น" ทั้งที่ยังมีของ = ปิดการขายทิ้งเอง
    g: 'ห้ามบอกหมดมั่ว', ask: 'อันนี้เป็นไงบ้างครับ',
    ai: 'หัว ESKO BAR SWITCH 20K ตอนนี้หมดทุกกลิ่นค่ะ 🙏🏻',
    mustNot: [/หมดทุกกลิ่น/], must: [/ยังมีของ/]
  },

  {
    // k71 เคสจริง 1/8 ยุค Qwen: ลูกค้าถาม "หัวดำ" → ได้คำตอบขัดกันเองในข้อความเดียว
    g: 'ห้ามตอบขัดกันเอง', ask: 'หัวดำ',
    ai: 'มีค่ะ 💕 "หัวดำ" มักหมายถึง ABC LEGO 20K ค่ะ\nABC LEGO 20K = 299 บาท\nสนใจตัวไหนดีคะ',
    must: [/หมดชั่วคราว/], mustNot: [/^มีค่ะ/m, /299/]
  },

  {
    // k72 เคสจริง: Qwen เขียนชื่อรุ่นเป็นภาษาไทยย่อ → ด่านกันลอกออเดอร์เก่าบล็อกทิ้ง
    g: 'ชื่อไทยต้องออกการ์ด', ask: 'เอามาโบองุ่น 2 ตัว',
    ai: 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- มาโบ | องุ่น | 2',
    must: [/การ์ด/], mustNot: [/รบกวนแจ้ง รุ่น/]
  },
  {
    // ต้องยังบล็อกรุ่นที่ลูกค้าไม่ได้สั่งเหมือนเดิม (ห้ามทำของเก่าพัง)
    g: 'ชื่อไทยต้องออกการ์ด', ask: 'เอามาโบองุ่น 2 ตัว',
    ai: 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- INFY 20K | โคล่า | 5',
    mustNot: [/การ์ด/]
  },

  {
    // k75 (เจ้านายสั่ง 1/8): ค่าส่งด่วนต้องมาจาก(?:แอดมิน|ทีมงาน)เช็คแอปจริง ⛔ ระบบห้าม quote ราคาเอง
    g: 'ค่าส่งด่วนตามแอป', ask: 'เอาส่งแกร็บ',
    noAI: true, must: [/(?:แอดมิน|ทีมงาน)เช็คราคา|เช็คราคาส่งด่วนจากแอป/], mustNot: [/ระบบคำนวณ/]
  },

  {
    // k76: "โอเค" ลอยๆ โดยไม่มีการ์ดค้าง → ห้ามส่งเลขบัญชี (กันยิงการ์ดมั่ว)
    g: 'ยืนยันหลวม', ask: 'โอเค',
    ai: 'รับทราบค่ะ 💕', mustNot: [/บัญชี/, /\[การ์ด/]
  },

  // ─── กลุ่ม 3: กันมโนกลิ่น / ลิสต์ว่าง (k16 + k40) ─────────────────
  {
    g: 'กันมโน', ask: 'มาโบ 9k ชอบแนวเย็นๆหวานๆ',
    ai: 'สำหรับกลิ่นเย็นๆ หวานๆ ในรุ่น MARBO 9K แนะนำค่ะ 💕\n- ลิ้นจี่ซากุระ\n- พีชโยเกิร์ตเย็น\n- มะพร้าวหิมะ\n\nสนใจกลิ่นไหนดีคะ',
    mustNot: [/ลิ้นจี่ซากุระ/, /มะพร้าวหิมะ/], must: [/•/]   // ต้องเติมกลิ่นจริงมาแทน ไม่ปล่อยว่าง
  },
  {
    g: 'กันมโน', ask: 'สูบทิ้งอันไหนหวานๆ',
    ai: 'ทางร้านมีพอตใช้แล้วทิ้งกลิ่นหวานๆ แนะนำดังนี้ค่ะ 💕\n- องุ่น\n- สตรอเบอร์รี่\n- แตงโม\n- โคล่า\n\nสนใจกลิ่นไหนคะ',
    must: [/ขึ้นกับแต่ละรุ่น/]
  },
  {
    g: 'กันมโน', ask: 'INFY BAR PRO มีกลิ่นอะไรบ้าง',
    noAI: true, must: [/INFY/]
  },
  {
    // เคสจริง 31/7: ถามความหมาย ไม่ได้ถามกลิ่น → ห้ามเอาลิสต์กลิ่นมาแปะ
    g: 'กันมโน', ask: 'ไอคอส คืออะไร',
    ai: 'IQOS เป็นอุปกรณ์สำหรับสูบไส้บุหรี่ชนิดพิเศษค่ะ ไม่ใช่พอตที่เติมน้ำยาเหมือนทั่วไปนะคะ\n\nทางร้านมีไส้บุหรี่ IQOS ให้เลือกหลายแบบเลยค่ะ เช่น IQOS JP, IQOS MALAY, IQOS INDO',
    must: [/^IQOS เป็นอุปกรณ์/], mustNot: [/^•/m]
  },
  {
    g: 'กันมโน', ask: 'IQOS JP ต่างกับ MALAY ยังไง',
    ai: 'ต่างกันที่แหล่งผลิตค่ะ IQOS JP กลิ่นให้เลือกเยอะกว่านะคะ',
    mustNot: [/^•/m]
  },

  {
    // k49: ลิงก์เมนูต้องเป็นตัวใหม่เสมอ (เลิกใช้เมนู Canva เก่าแล้ว)
    g: 'ลิงก์เมนู', ask: 'ขอดูเมนูสินค้า',
    noAI: true, must: [/cutt\.ly\/menu4/], mustNot: [/abc-menu/]
  },

  // (กลุ่ม 3.4 "เลโก้ 3 ยี่ห้อ" ย้ายไปเทสที่ legoHint โดยตรง — k56 ให้ AI เรียบเรียงคำพูดเอง)

  // ─── กลุ่ม 3.5: ถามเชิงอธิบาย ห้ามตอบด้วยสถานะสต็อก (k46) ────────
  {
    // เคสจริง 31/7: ถาม "คืออะไร" → จีทูตอบ "ขออภัยค่ะ หมดทุกกลิ่น"
    g: 'ถามความรู้', ask: 'น้ำยา Freebase และ Saltnic คืออะไร',
    noAI: true, must: [/FREEBASE/, /SALTNIC/, /นิโคติน/], mustNot: [/หมดทุกกลิ่น/, /ขออภัย/]
  },
  {
    g: 'ถามความรู้', ask: 'ฟรีเบสกับซอลนิคต่างกันยังไง',
    noAI: true, must: [/เมฆ|ควัน/], mustNot: [/หมด/]
  },
  {
    g: 'ถามความรู้', ask: 'มือใหม่ควรใช้ saltnic หรือ freebase',
    noAI: true, must: [/SALTNIC/]
  },

  // ─── กลุ่ม 4: กันโยนแอดมินมั่ว แล้วแชทตาย 12 ชม. (k36) ───────────
  {
    g: 'ส่งต่อแอดมิน', ask: 'สูบละทิ้ง มีกี่แบบ',
    ai: 'รอสักครู่นะคะ 🙏🏻 ทีมงานหลังการขายจะเข้ามาดูแลให้บริการค่ะ 💕',
    mustNot: [/ทีมงานหลังการขาย/], muted: false
  },
  {
    g: 'ส่งต่อแอดมิน', ask: 'งั้นเพิ่มอีก1แท่งครับ',
    ai: 'รอสักครู่นะคะ 🙏🏻 ทีมงานหลังการขายจะเข้ามาดูแลให้บริการค่ะ 💕',
    mustNot: [/ทีมงานหลังการขาย/], muted: false
  },
  {
    g: 'ส่งต่อแอดมิน', ask: 'สั่งไป 3 วันแล้วของยังไม่ถึงเลยครับ',
    must: [/(?:แอดมิน|ทีมงาน)/], muted: true
  },
  {
    g: 'ส่งต่อแอดมิน', ask: 'ของเสียใช้ไม่ได้เลย',
    must: [/(?:แอดมิน|ทีมงาน)/], muted: true
  },

  // ─── กลุ่ม 5: ราคา / โปร ที่ห้ามเพี้ยน ───────────────────────────
  {
    g: 'ราคา', ask: 'มาโบราคาเท่าไหร่',
    ai: 'MARBO 9K (290-350 บาท) ค่ะ',
    mustNot: [/290\s*[-–—]\s*350/], must: [/แท้ 350/, /โคลน/]
  },
  {
    g: 'ราคา', ask: 'ขอลดหน่อยได้ไหม',
    ai: 'ได้ค่ะ ลดให้ 50 บาทเลยนะคะ',
    mustNot: [/ลดให้ 50/]   // ⚠️ ถ้าข้อนี้แดง = ยังไม่มีตัวกันจีทูลดราคาเอง
  },

  // ─── กลุ่ม 6: เลขบัญชี ต้องออกจากระบบเท่านั้น ────────────────────
  {
    g: 'เลขบัญชี', ask: 'ขอเลขบัญชีหน่อย',
    ai: 'โอนมาที่ 123-4-56789-0 ธนาคารตัวอย่าง ชื่อบัญชี บริษัท เอบีซี ค่ะ',
    mustNot: [/123-4-56789-0/]
  },
];

// ═══════════════════════════════════════════════════════════════════
const RESET = '\x1b[0m', RED = '\x1b[31m', GRN = '\x1b[32m', DIM = '\x1b[2m', YEL = '\x1b[33m';
let pass = 0; const fails = [];

for (let i = 0; i < CASES.length; i++) {
  const c = CASES[i];
  const r = await run(c.ask, c.ai);
  const why = [];
  if (c.noAI && r.aiCalled) why.push('เรียก AI ทั้งที่ควรตอบตายตัว');
  for (const re of (c.must || [])) if (!re.test(r.out)) why.push('ขาด ' + re);
  for (const re of (c.mustNot || [])) if (re.test(r.out)) why.push('มีสิ่งต้องห้าม ' + re);
  if (c.muted === true && !r.muted) why.push('ควรส่งต่อแอดมิน (ปิดแชท) แต่ไม่ปิด');
  if (c.muted === false && r.muted) why.push('ไม่ควรปิดแชท แต่ปิด');
  if (!r.out.trim()) why.push('ไม่ตอบอะไรเลย');

  const n = String(i + 1).padStart(2, '0');
  if (!why.length) { pass++; console.log(`${GRN}✅ ${n}${RESET} ${DIM}[${c.g}]${RESET} ${c.ask}`); }
  else {
    fails.push({ n, c, why, out: r.out });
    console.log(`${RED}❌ ${n}${RESET} ${DIM}[${c.g}]${RESET} ${c.ask}`);
    for (const w of why) console.log(`      ${RED}↳${RESET} ${w}`);
  }
}

// ═══ ทดสอบ "ความจำ 24 ชม." แยกต่างหาก (เทสฟังก์ชันตรงๆ ไม่ต้องยิงแชท) ═══
async function memTests() {
  const T = [];
  const HOUR = 3600 * 1000, now = Date.now();
  const mk = (agoH) => [
    { role: 'user', content: 'บลูไอซ์มีไหม', t: now - agoH * HOUR },
    { role: 'assistant', content: 'มีพร้อมส่งค่ะ', t: now - agoH * HOUR }
  ];

  // 32) คุยต่อเนื่อง (10 นาทีที่แล้ว) → ห้ามมีคำเตือน
  {
    const out = histForAI(mk(0.17), 6);
    const warned = out.some(m => m.role === 'system' && /ชม\.ที่แล้ว/.test(m.content));
    T.push({ n: 32, name: 'คุยต่อเนื่อง 10 นาที → ไม่เตือน', ok: !warned && out.length === 2, why: warned ? 'เตือนทั้งที่เพิ่งคุย' : (out.length !== 2 ? 'จำนวนข้อความผิด' : '') });
  }
  // 33) กลับมาใหม่หลัง 20 ชม. → ต้องเตือน AI ว่าอย่าเชื่อสต็อกเก่า
  {
    const out = histForAI(mk(20), 6);
    const w = out.find(m => m.role === 'system');
    const ok = !!w && /ห้ามยืนยัน/.test(w.content) && /สต็อก/.test(w.content);
    T.push({ n: 33, name: 'กลับมาหลัง 20 ชม. → เตือนห้ามเชื่อสต็อกเก่า', ok, why: ok ? '' : 'ไม่มีคำเตือน หรือคำเตือนไม่ครบ' });
  }
  // 34) ห้ามมีฟิลด์ t หลุดไปหา OpenRouter (จะโดนตีกลับ 400)
  {
    const out = histForAI(mk(20), 6);
    const dirty = out.some(m => Object.keys(m).some(k => k !== 'role' && k !== 'content'));
    T.push({ n: 34, name: 'ไม่มีฟิลด์แปลกปลอมหลุดไป AI', ok: !dirty, why: dirty ? 'มีฟิลด์เกิน role/content' : '' });
  }
  // 35) ข้อมูลเก่าที่ไม่มีเวลา (ก่อนอัพเดต) ต้องไม่ทำให้พัง
  {
    let ok = true, why = '';
    try {
      const out = histForAI([{ role: 'user', content: 'เก่าไม่มีเวลา' }], 6);
      if (out.length !== 1) { ok = false; why = 'จำนวนข้อความผิด'; }
    } catch (e) { ok = false; why = 'พัง: ' + e; }
    T.push({ n: 35, name: 'ประวัติเก่าที่ไม่มีเวลา ไม่ทำให้พัง', ok, why });
  }
  // 36) stampHist ต้องติดเวลาให้ครบ และไม่ทับของเดิม
  {
    const old = { role: 'user', content: 'a', t: 111 };
    const r = stampHist([old, { role: 'assistant', content: 'b' }]);
    const ok = r[0].t === 111 && typeof r[1].t === 'number' && r[1].t > 1e12;
    T.push({ n: 36, name: 'ติดเวลาให้ข้อความใหม่ ไม่ทับของเก่า', ok, why: ok ? '' : 'ติดเวลาผิด' });
  }
  // ── k55: จำว่ากำลังคุยรุ่นไหนอยู่ (เคสจริง 1/8 "เอสโค่เข้าเมื่อไหร่" → "มีกลิ่นไรเหลือบ้าง") ──
  const H = (...msgs) => msgs.map((c, i) => ({ role: i % 2 ? 'assistant' : 'user', content: c }));
  {
    const got = carryModel('มีกลิ่นไรเหลือบ้าง', H('เอสโค่เข้าเมื่อไหร่', 'ยังระบุวันไม่ได้ค่ะ'));
    const ok = /esko/i.test(got);
    T.push({ n: 59, name: 'ถาม "มีกลิ่นไรเหลือบ้าง" ลอยๆ → จำได้ว่าคุย ESKO อยู่', ok, why: ok ? '' : 'ไม่ดึงรุ่นจากบทสนทนา ได้ "' + got + '"' });
  }
  {
    const got = carryModel('ตอนนี้เหลือไรบ้าง', H('MARBO 9K ราคาเท่าไหร่', '350 บาทค่ะ'));
    const ok = /MARBO 9K/i.test(got);
    T.push({ n: 60, name: 'ถาม "ตอนนี้เหลือไรบ้าง" → จำได้ว่าคุย MARBO 9K', ok, why: ok ? '' : 'ได้ "' + got + '"' });
  }
  {
    const got = carryModel('MARBO 9K มีกลิ่นอะไรบ้าง', H('เอสโค่เข้าเมื่อไหร่', 'ยังระบุวันไม่ได้ค่ะ'));
    T.push({ n: 61, name: 'ระบุรุ่นมาเองแล้ว → ห้ามเอารุ่นเก่ามาทับ', ok: got === '', why: got === '' ? '' : 'ดันเติม "' + got + '" ทับ' });
  }
  {
    const got = carryModel('ขอบคุณครับ', H('เอสโค่เข้าเมื่อไหร่', 'ยังระบุวันไม่ได้ค่ะ'));
    T.push({ n: 62, name: 'ทักทาย/ขอบคุณ ไม่ได้ถามของ → ห้ามเติมรุ่น', ok: got === '', why: got === '' ? '' : 'เติม "' + got + '" ทั้งที่ไม่ได้ถามของ' });
  }
  {
    const got = carryModel('มีกลิ่นไรบ้าง', []);
    T.push({ n: 63, name: 'ไม่มีบทสนทนาก่อนหน้า → ไม่พัง ไม่เดามั่ว', ok: got === '', why: got === '' ? '' : 'เดารุ่น "' + got + '" จากอากาศ' });
  }
  // ── k95: บอทถามยืนยันรุ่น → ลูกค้าตอบ "ใช่ครับ" ต้องจำรุ่นนั้นต่อ (ไม่โยนแอดมิน) ──
  {
    const got = carryModel('ใช่ครับ', [{ role: 'user', content: 'มีแท้มั้ย' }, { role: 'assistant', content: 'หมายถึง MARBO 9K แท้ (350 บาท) ใช่ไหมคะ 💕' }]);
    const no = carryModel('ใช่ครับ', [{ role: 'user', content: 'สวัสดี' }, { role: 'assistant', content: 'ยินดีต้อนรับค่ะ' }]);
    T.push({ n: 121, name: 'k95 ตอบ "ใช่ครับ" หลังบอทถามยืนยันรุ่น → จำรุ่นได้', ok: /MARBO 9K/.test(got) && no === '', why: 'got=' + got + ' no=' + no });
  }
  // ── k74: ถามหาสินค้าด้วยคำที่ไม่รู้จัก → ต้องสั่งให้ถามกลับ ห้ามเดา ──
  {
    const SM4 = JSON.parse(JSON.stringify(stockmap));
    const warn = unknownAskHint('มีวูเปอร์แม็กซ์มั้ย', SM4, 1);
    T.push({ n: 99, name: 'คำไม่รู้จัก ("วูเปอร์แม็กซ์") → สั่งห้ามเดา+ให้ถามกลับ', ok: /ห้ามเดา/.test(warn), why: 'ไม่เตือน' });
  }
  {
    const SM4 = JSON.parse(JSON.stringify(stockmap));
    const ok1 = unknownAskHint('มาโบ 9k ราคาเท่าไหร่', SM4, 1) === '';
    const ok2 = unknownAskHint('มีโปรอะไรมั้ย', SM4, 1) === '';
    const ok3 = unknownAskHint('เอาองุ่น 2', SM4, 1) === '';
    T.push({ n: 100, name: 'คำที่รู้จัก/เรื่องทั่วไป → ไม่เด้งเตือนผิดจังหวะ', ok: ok1 && ok2 && ok3, why: [ok1,ok2,ok3].join(',') });
  }

  // ── k77 (เคสจริง 1/8): "เจอร้านมา" มี "นม" ซ่อน → เด้งลิสต์กลิ่นกาแฟ/นมใส่ลูกค้า ──
  {
    const SM5 = JSON.parse(JSON.stringify(stockmap));
    const bad = ['เจอร้านมา จาก facebook ครับ', 'เอาเย็นนี้ได้มั้ย', 'ชาร์จยังไง'].filter(q => styleHint(q, SM5, 1) !== '');
    const good = ['อยากได้แนวชา', 'มีชานมมั้ย', 'แนวเย็นๆหวานๆ'].filter(q => styleHint(q, SM5, 1) === '');
    T.push({ n: 101, name: 'STYLE_MAP ไม่โดนคำครอบ (ร้านมา/เย็นนี้/ชาร์จ) + ของจริงยังเจอ', ok: !bad.length && !good.length,
             why: 'เด้งผิด: ' + bad.join(',') + ' | หายไป: ' + good.join(',') });
  }

  // ── k79: ถ้าจ่ายแล้วจริง (ord ✅) → AI พูด "ยืนยันการชำระแล้ว" ได้ ห้ามบล็อกผิดตัว ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K79';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: 'รวมยอดชำระ 390', items: [{ model: 'MARBO 9K', flavor: 'องุ่น', qty: 1 }], t: Date.now(), status: 'ชำระแล้ว ✅ ยอด 390 ตรงออเดอร์ (รอที่อยู่จัดส่ง)', uid }));
    sent = []; aiCalled = false; aiReply = 'ยืนยันการชำระเงินเรียบร้อยแล้วค่ะ 🎉 รบกวนแจ้งที่อยู่จัดส่งนะคะ 💕';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'คือไร', id: '1' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 104, name: 'k79 จ่ายแล้วจริง → AI ยืนยันชำระได้ ไม่โดนตาข่ายบล็อก', ok: /ยืนยันการชำระ/.test(txt) && !/ยังไม่พบสลิป/.test(txt), why: txt.slice(0, 80) });
  }
  // ── k82 (เจ้านายเทส 2/8): "ยืนยัน" หลังการ์ด ต้องได้เลขบัญชี ไม่วนทวน แม้ก่อนหน้าคุยกลิ่นอื่นไว้ ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K82';
    const now = Date.now();
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: '📦 ออเดอร์ (รอโอน)\n- หัวพอต INFY PLUS หมากฝรั่งองุ่น x10 = 1400\nยอดสินค้า 1400\nค่าส่ง 0\nรวมยอดชำระ 1400', items: [], t: now - 60000, status: 'รอโอน 💰', uid }));
    // ประวัติ "ก่อนการ์ดออก": บอทลิสต์กลิ่นหลายชื่อ (มีกลิ่นที่ไม่อยู่ในการ์ด) — เดิมทำให้นึกว่าเปลี่ยนใจ
    store.set('conv3:v20:' + uid, JSON.stringify([
      { role: 'user', content: 'INFY PLUS มีกลิ่นไรบ้าง', t: now - 300000 },
      { role: 'assistant', content: 'มี หมากฝรั่งองุ่น สตรอเบอร์รี่ มิ้นต์ฟรีซ โคล่าไอซ์ ค่ะ', t: now - 290000 },
      { role: 'user', content: 'เอาหมากฝรั่งองุ่น 10 หัว', t: now - 120000 },
      { role: 'assistant', content: 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- INFY PLUS | หมากฝรั่งองุ่น | 10', t: now - 70000 },
    ]));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ยืนยัน', id: '1' } }, env, 'TOKEN', 'v20');
    const flex = sent.flatMap(b => b.messages || []).filter(m => m.type === 'flex');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 110, name: 'k82 "ยืนยัน" + เคยคุยกลิ่นอื่นก่อนการ์ด → เลขบัญชีออก ไม่วนทวน',
      ok: flex.length === 1 && !/ยืนยันรายการเดิม/.test(txt), why: 'flex=' + flex.length + ' txt=' + txt.slice(0, 60) });
  }
  {
    // k82: กันของเดิมไม่พัง — คุยกลิ่นใหม่ "หลังการ์ดออก" แล้วพิมพ์ยืนยัน → ต้องทวนก่อน
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K82b';
    const now = Date.now();
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: '📦 ออเดอร์ (รอโอน)\n- หัวพอต INFY PLUS หมากฝรั่งองุ่น x10 = 1400\nรวมยอดชำระ 1400', items: [], t: now - 600000, status: 'รอโอน 💰', uid }));
    store.set('conv3:v20:' + uid, JSON.stringify([
      { role: 'user', content: 'MARBO 9K บลูราสเบอร์รี่ มีมั้ย', t: now - 60000 },
      { role: 'assistant', content: 'มีค่ะ', t: now - 50000 },
    ]));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ยืนยัน', id: '1' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 111, name: 'k82 คุยกลิ่นใหม่หลังการ์ด → ยังทวน "ยืนยันรายการเดิม" ตามเดิม',
      ok: /ยืนยันรายการเดิม/.test(txt), why: txt.slice(0, 60) });
  }
  {
    // k82: "ของถึงวันไหน" ต้องไม่โดน unknownAskHint ("ขอ" ครอบใน "ของ")
    const SM6 = JSON.parse(JSON.stringify(stockmap));
    const bad = ['ของถึงวันไหน', 'ของมาถึงเมื่อไหร่', 'ส่งตอนไหน', 'ขอบคุณครับ', 'ขอบคุณมากค่ะ'].filter(q => unknownAskHint(q, SM6, 1) !== '');
    const still = unknownAskHint('มีวูเปอร์แม็กซ์มั้ย', SM6, 1) !== '';
    T.push({ n: 112, name: 'k82 คำถามเวลาส่งไม่โดนหาว่าเป็นชื่อรุ่น + ของจริงยังเตือน', ok: !bad.length && still, why: 'เด้งผิด: ' + bad.join(',') + ' ของจริง=' + still });
  }

  // ── k89 (เจ้านายเจอทุกครั้ง): พิมพ์ตกตัวอักษร → ต้องเดาแล้วถามยืนยัน ไม่ใช่วนถามใหม่ ──
  {
    const SM7 = JSON.parse(JSON.stringify(stockmap));
    const g1 = typoHint('Ks สัปรส', SM7, 1);
    const g2 = typoHint('เอามาโบ สตรอเบอรี่', SM7, 1);
    const none = typoHint('สวัสดีครับ', SM7, 1);
    T.push({ n: 118, name: 'k89 เดาคำสะกดเพี้ยน "สัปรส"→สับปะรด + ถามยืนยัน ไม่มั่วสั่ง',
      ok: /สับปะรด/.test(g1) && /ถามยืนยัน/.test(g1) && none === '',
      why: 'g1=' + g1.slice(0, 90).replace(/\n/g, ' ') + ' | ทักทาย=' + (none === '' ? 'เฉย' : 'เด้งผิด') });
  }

  // ── k91 ด่านตรวจข้อเท็จจริง: ราคาผิด / เรียกเครื่องผิด / แบรนด์ไม่มีจริง ──
  {
    const a = factGate('หัวพอต RELX INFINITY ราคา 200 บาทค่ะ');
    const b = factGate('เครื่อง RELX BOOST POD พร้อมส่งค่ะ');
    const c = factGate('มีรุ่น VAPEXTREME 30K ค่ะ');
    const d = factGate('MARBO 9K 350 บาท และ ABC 8K 250 บาท');   // ถูกอยู่แล้ว ห้ามแก้
    const e = factGate('ยอดสินค้า 700 บาท ค่าส่ง 40 บาท รวม 740 บาท');  // บรรทัดเงิน ห้ามแตะ
    T.push({ n: 120, name: 'k91 ด่านตรวจ: แก้ราคาผิด/ตัดคำว่าเครื่อง/จับแบรนด์มั่ว และไม่แก้ของที่ถูกอยู่แล้ว',
      ok: /140 บาท/.test(a.text) && a.hit.price === 1
        && !/เครื่อง RELX BOOST POD/.test(b.text) && b.hit.device === 1
        && c.hit.model >= 1
        && d.text === 'MARBO 9K 350 บาท และ ABC 8K 250 บาท'
        && e.text.indexOf('740 บาท') !== -1,
      why: 'a=' + a.text + ' | b=' + b.text + ' | c=' + c.hit.model + ' | d=' + (d.text.slice(0, 30)) });
  }

  // ── k90 (เคสจริง 2/8): ห้ามเดากลิ่นตอนลูกค้าถามเชิงเปรียบเทียบ/ถามราคา ──
  {
    const SM8 = JSON.parse(JSON.stringify(stockmap));
    const bad = ['ต่างกับ relx boost pod ยังไงบ้าง', 'แล้วเครื่อง relx creator ล่ะ', 'เท่าไหร่', 'ใช้ด้วยกันได้มั้ย', 'อันไหนดีกว่ากัน'].filter(q => typoHint(q, SM8, 1) !== '');
    const good = ['เอา ks สัปรส 1 อัน', 'ขอ relx องุนอโล'].filter(q => typoHint(q, SM8, 1) === '');
    T.push({ n: 119, name: 'k90 ถามเปรียบเทียบ/ราคา → ห้ามเดากลิ่นปิดท้าย + ของจริงยังเดาได้', ok: !bad.length && !good.length, why: 'เด้งผิด: ' + bad.join(',') + ' | หายไป: ' + good.join(',') });
  }

  // ── k88 (เคสจริง 2/8 บั๊กเงิน): ใบสรุปที่ AI พิมพ์ ต้องถูกทับด้วยยอดจริงจากระบบเสมอ ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K88';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: '📦 ออเดอร์ (รอโอน)\n- KS Quik 6K สับปะรด x1 = 280\nยอดสินค้า 280\nค่าส่ง 40\nรวมยอดชำระ 320\nที่อยู่: (รอลูกค้าแจ้งหลังโอน)', items: [], t: Date.now(), status: 'ชำระแล้ว ✅ ยอด 320 (รอที่อยู่)', uid }));
    sent = []; aiCalled = false;
    aiReply = '📦 สรุปออเดอร์\nสินค้า: SALTNIC MARBO 30ML x1 (กลิ่น: เงิน)\nราคาสินค้า: 270\nค่าส่ง: 40\nยอดรวม: 310\nชื่อผู้รับ: จิรธัช\nเบอร์: 0845446161\nที่อยู่: 222/28 เพชรเกษม กรุงเทพ 10160\nชำระ: โอน';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'จิรธัช 0845446161 222/28 เพชรเกษม กรุงเทพ 10160', id: '1' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 117, name: 'k88 ใบสรุปต้องใช้ยอดจริงจากระบบ (320) ไม่ใช่เลขที่ AI คิดเอง (310)',
      ok: /ยอดรวม:\s*320/.test(txt) && !/ยอดรวม:\s*310/.test(txt) && /KS Quik 6K/.test(txt),
      why: txt.replace(/\n/g, ' | ').slice(0, 150) });
  }

  // ── k106: ถามโปรตอนคุยรุ่นอยู่ → บอกโปรของรุ่นนั้นตรงๆ ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K106';
    store.set('conv3:v20:' + uid, JSON.stringify([
      { role: 'user', content: 'มีไอคอสไหม', t: Date.now() - 60000 },
      { role: 'assistant', content: 'ไส้บุหรี่ IQOS JP - SMOOTH REGULAR (2,150 บาท) สนใจรับกี่ชิ้นดีคะ', t: Date.now() - 50000 },
    ]));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'มีโปรโมชั่นไหม', id: '1' } }, env, 'TOKEN', 'v20');
    const t1 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    // ไม่มีบริบทรุ่น → ลิสต์รวมเหมือนเดิม
    store.delete('conv3:v20:' + uid);
    sent = [];
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: 'K106b' }, message: { type: 'text', text: 'มีโปรอะไรบ้าง', id: '2' } }, env, 'TOKEN', 'v20');
    const t2 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 128, name: 'k106 ถามโปรตอนคุย IQOS → ตอบโปรไส้บุหรี่ 2 ชิ้น / ไม่มีบริบท → ลิสต์รวม',
      ok: /2 ชิ้น/.test(t1) && /IQOS/.test(t1) && !aiCalled && /หัวพอตเล็ก — ครบ 10 หัว/.test(t2),
      why: 't1=' + t1.slice(0, 70) });
  }

  // ── k104 (เคสจริง 2/8): โหมดส่งด่วน ห้ามพูด "ส่งฟรี" + ทวงราคาที่แจ้งแล้วต้องตอบตรง ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K104';
    store.set('exp:v20:' + uid, JSON.stringify({ fee: 69, km: 5, lat: 13.7, lng: 100.5, t: Date.now() }));
    sent = []; aiCalled = false;
    aiReply = 'รับ MARBO 9K 4 แท่งค่ะ ส่งฟรีเลยนะคะ 💕';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'เอามาโบสี่แท่งค่ะ', id: '1' } }, env, 'TOKEN', 'v20');
    const t1 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ก็แจ้งมาแล้วไม่ใช่หรอคะ 69 บาท', id: '2' } }, env, 'TOKEN', 'v20');
    const t2 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 127, name: 'k104 โหมดส่งด่วน: ไม่พูดส่งฟรี + ทวงราคา 69 → ยืนยันตรง ไม่ตอบราคาสินค้ามั่ว',
      ok: !/ส่งฟรีเลย/.test(t1) && /ตามระยะทาง/.test(t1) && /69 บาท/.test(t2) && !/MARBO 9K แท้ราคา|ABC LEGO/.test(t2),
      why: 't1=' + t1.slice(0, 60) + ' | t2=' + t2.slice(0, 60) });
  }

  // ── k103 (เคสจริง 2/8): จ่ายแล้ว + "ส่งแกรปตามหมุด" → ปิดออเดอร์ด้วยหมุด ไม่เริ่มขายใหม่ ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K103';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: 'รวมยอดชำระ 970\nที่อยู่: (รอลูกค้าแจ้งหลังโอน)', items: [], t: Date.now(), status: 'ชำระแล้ว ✅ ยอด 970 (รอที่อยู่)', uid }));
    store.set('exp:v20:' + uid, JSON.stringify({ fee: 270, km: 27, lat: 13.7, lng: 100.5, t: Date.now() }));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ส่งแกรปตามหมุด', id: '1' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    const oj = JSON.parse(store.get('ord:v20:' + uid) || '{}');
    T.push({ n: 126, name: 'k103 จ่ายแล้ว+ตามหมุด → ปิดออเดอร์ด้วยพิกัด ไม่ถามรุ่น/ไม่โควตใหม่',
      ok: /ตามหมุด/.test(txt) && !/รับสินค้ารุ่นไหน|ค่าส่งด่วนประมาณ/.test(txt) && /พร้อมจัดส่ง/.test(oj.status || '') && /maps/.test(oj.block || ''),
      why: txt.slice(0, 70) + ' | st=' + (oj.status || '') });
  }

  // ── k102 (เคสจริง 2/8): สั่ง+ส่งด่วน แต่ยังไม่รู้ค่าส่ง → ห้ามออกการ์ดยอดพัสดุตัดหน้า ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K102';
    sent = []; aiCalled = false; aiReply = 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- MARBO 9K | องุ่น | 2';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'เอา มาโบองุ่น 2 ส่งด่วน', id: '1' } }, env, 'TOKEN', 'v20');
    const flex = sent.flatMap(b => b.messages || []).filter(m => m.type === 'flex');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    const oj = JSON.parse(store.get('ord:v20:' + uid) || '{}');
    T.push({ n: 124, name: 'k102 สั่ง+ส่งด่วน (ไม่รู้ค่าส่ง) → ไม่มีการ์ด 740 / รับรายการ+ขอหมุด / ord เก็บ items',
      ok: !flex.length && /รับออเดอร์ไว้แล้ว/.test(txt) && /โลเคชั่น|ปักหมุด/.test(txt) && !/740/.test(txt) && Array.isArray(oj.items) && oj.items.length === 1,
      why: 'flex=' + flex.length + ' txt=' + txt.slice(0, 70) });
  }

  // ── k107 (เคสจริง 2/8 20.21 น.): แอดมินกรอกค่าส่ง 100 แล้ว ลูกค้าสั่งของทันที
  //    แต่แคช KV ยังตอบค่าเก่า (pending) → จีทูบอก "กำลังเช็คค่าส่ง" ทั้งที่แจ้งราคาไปแล้ว
  //    แก้: EXPFEE ในหน่วยความจำชนะแคช → การ์ดต้องออกพร้อมยอดรวมทันที
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K107';
    await workerApp.fetch(new Request('https://x/expfee?key=testkey&shop=v20&uid=' + uid + '&fee=100'), env, { waitUntil: () => {} });
    store.set('exp:v20:' + uid, JSON.stringify({ pending: true, km: 5, lat: 13.7, lng: 100.5, t: Date.now() }));
    store.delete('ord:v20:' + uid);
    sent = []; aiCalled = false; aiReply = 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- MARBO 9K | หมากฝรั่งแตงโม | 1';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'เอาหมากฝรั่งแตงโม 1 ครับ', id: '1' } }, env, 'TOKEN', 'v20');
    const flex = sent.flatMap(b => b.messages || []).filter(m => m.type === 'flex');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    const all = JSON.stringify(sent);
    T.push({ n: 129, name: 'k107 แอดมินกรอกค่าส่งแล้ว+สั่งของทันที (แคช KV ค้าง) → การ์ดออกเลย ยอดรวมค่าส่งด่วน ไม่พูดรอเช็ค',
      ok: flex.length === 1 && !/กำลังเช็คค่าส่งด่วน/.test(txt) && /450/.test(all),
      why: 'flex=' + flex.length + ' รอเช็ค=' + /กำลังเช็คค่าส่งด่วน/.test(txt) + ' 450=' + /450/.test(all) + ' txt=' + txt.slice(0, 50) });
  }

  // ── k108 (เคสจริง 2/8 20.47 น.): ยกเลิกออเดอร์ยังไม่โอน → ยกเลิกทันที ไม่เงียบ + ล้างค่าส่งจำไว้ ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K108';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: 'ยอดสินค้า 350', items: [{ model: 'MARBO 9K', flavor: 'หมากฝรั่งแตงโม', qty: 1 }], t: Date.now(), status: 'รอโอน 💰', uid }));
    await workerApp.fetch(new Request('https://x/expfee?key=testkey&shop=v20&uid=' + uid + '&fee=100'), env, { waitUntil: () => {} });
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ยกเลิกอันเก่าทั้งหมด', id: '1' } }, env, 'TOKEN', 'v20');
    const t1 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    const cancelOk = /ยกเลิกรายการให้เรียบร้อย/.test(t1) && !store.has('mute:v20:' + uid) && !store.has('ord:v20:' + uid);
    // คุยต่อได้เลย: ถามส่งแกรป → ต้องได้คำตอบ (ไม่เงียบ) และไม่แอบใช้ค่าส่ง 100 เดิม
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ส่งแกรปหน่อยครับ', id: '2' } }, env, 'TOKEN', 'v20');
    const t2 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 130, name: 'k108 ยกเลิก (ยังไม่โอน) → ยกเลิกเลย ไม่มิ้วต์ + ถามต่อได้ ไม่ใช้ค่าส่งเก่า',
      ok: cancelOk && t2.length > 0 && !/100 บาท/.test(t2),
      why: 'cancel=' + cancelOk + ' t2=' + t2.slice(0, 50) });
  }
  {
    // k108: ยกเลิกออเดอร์ที่ "โอนแล้ว ✅" → ต้องส่งแอดมิน+มิ้วต์เหมือนเดิม (เรื่องเงินให้คนดู)
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K108b';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: 'รวมยอดชำระ 450', items: [], t: Date.now(), status: 'ชำระแล้ว ✅ ยอด 450 (รอที่อยู่)', uid }));
    sent = [];
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ขอยกเลิกออเดอร์', id: '1' } }, env, 'TOKEN', 'v20');
    const t1 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 131, name: 'k108 ยกเลิก (โอนแล้ว ✅) → ส่งแอดมิน + ออเดอร์ยังอยู่ (รอคนตัดสิน)',
      ok: /(?:แอดมิน|ทีมงาน)เช็คออเดอร์/.test(t1) && store.has('mute:v20:' + uid) && store.has('ord:v20:' + uid),
      why: t1.slice(0, 50) + ' mute=' + store.has('mute:v20:' + uid) });
  }

  // ── k109 (เคสจริง 2/8 20.51 น.): สั่งกลิ่นที่หมด แต่ตระกูลเดียวกันยังมี → ต้องเสนอ ไม่ใช่บอกหมดห้วนๆ ──
  {
    store = new Map();
    const sm109 = { ...stockmap };
    sm109['MARBO 9K - สตรอว์เบอร์รี่'] = 0;
    store.set('stockmap', JSON.stringify(sm109));
    store.set('stockbuffer', '1');
    const uid = 'K109';
    sent = []; aiCalled = false; aiReply = 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- MARBO 9K | สตรอว์เบอร์รี่ | 1';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'เปลี่ยนเป็น สตอเบอรี่ 1', id: '1' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 132, name: 'k109 กลิ่นหมดแต่ตระกูลเดียวกันมี → เสนอ มิลค์เชค/กีวี่ ให้เลือกแทน',
      ok: /หมดชั่วคราว/.test(txt) && /มิลค์เชค/.test(txt) && /กีวี่/.test(txt) && /รับตัวไหนแทน/.test(txt),
      why: txt.slice(0, 90) });
  }
  {
    // k109: สต็อกเหลือ 1 (= กันชน) → ข้อมูลที่ส่งให้ AI ต้องบอก "หมด" เหมือนตอนออกการ์ด
    store = new Map();
    const sm109b = { ...stockmap };
    sm109b['MARBO 9K - องุ่น'] = 1;
    store.set('stockmap', JSON.stringify(sm109b));
    store.set('stockbuffer', '1');
    const uid = 'K109b';
    sent = []; aiCalled = false; globalThis.__aiBody = '';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'มาโบ 9K องุ่น มีของมั้ยครับ', id: '1' } }, env, 'TOKEN', 'v20');
    const body = String(globalThis.__aiBody || '');
    const line = (body.split('\\n').find(l => l.includes('MARBO 9K - องุ่น:')) || '');
    T.push({ n: 133, name: 'k109 เหลือ 1 ชิ้น (=กันชน) → ข้อมูลให้ AI ต้องเป็น ❌ หมด (เกณฑ์เดียวกับการ์ด)',
      ok: line.includes('หมด') && !line.includes('มีของ'),
      why: 'line=' + line.slice(0, 60) });
  }

  // ── k110 (เคสจริง 2/8 20.53 น.): ออเดอร์ส่งด่วน+สลิปผ่าน → ห้ามถาม "ส่งที่เดิมไหม" (ที่อยู่พัสดุเก่า) ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K110';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: '📦 ออเดอร์ (รอโอน)\n- MARBO 9K สตรอว์เบอร์รี่กีวี่ x1 = 350\nรวมยอดชำระ 1205\nที่อยู่: (รอลูกค้าแจ้งหลังโอน)', items: [], t: Date.now(), status: 'รอโอน 💰', uid }));
    store.set('exp:v20:' + uid, JSON.stringify({ fee: 155, km: 5, lat: 13.7, lng: 100.5, t: Date.now() }));
    store.set('cust:v20:' + uid, JSON.stringify({ name: 'สุธีมนต์', tel: '0830217378', addr: 'ห้องพักสมบูรณ์ บ้านค่าย ระยอง' }));
    globalThis.__slipok = { success: true, data: { success: true, amount: 1205, receiver: { displayName: 'ร้าน ABC' } } };
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'image', id: '99' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    const oj = JSON.parse(store.get('ord:v20:' + uid) || '{}');
    T.push({ n: 134, name: 'k110 ส่งด่วน+สลิปผ่าน → ขอชื่อ+เบอร์สำหรับไรเดอร์ ไม่ถามที่เดิม/ที่อยู่พัสดุ + ord มีลิงก์หมุด',
      ok: /สลิปถูกต้อง/.test(txt) && /ส่งด่วนตามหมุด/.test(txt) && !/ส่งที่เดิมไหม/.test(txt) && !/ระยอง/.test(txt) && /maps/.test(oj.block || ''),
      why: txt.slice(0, 80) + ' | blockmaps=' + /maps/.test(oj.block || '') });
    globalThis.__slipok = null;
  }

  // ── k112 (จากตัวจำลอง 2/8): หมุดนอกเขต → /expfee ต้องปฏิเสธ + ถามส่งด่วนซ้ำต้องตอบนอกเขตตรงๆ ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K112';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'location', latitude: 16.44, longitude: 100.35, id: '1' } }, env, 'TOKEN', 'v20');
    const r = await workerApp.fetch(new Request('https://x/expfee?key=testkey&shop=v20&uid=' + uid + '&fee=500'), env, { waitUntil: () => {} });
    const rj = await r.json();
    sent = [];
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ส่งแกรปได้มั้ย', id: '2' } }, env, 'TOKEN', 'v20');
    const t2 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 135, name: 'k112 หมุดนอกเขต → /expfee ปฏิเสธราคา + ถามส่งด่วนซ้ำได้คำตอบนอกเขต (ไม่วนขอหมุด)',
      ok: r.status === 400 && /นอกเขต/.test(JSON.stringify(rj)) && /นอกเขต/.test(t2) && !/แชร์โลเคชั่น|ปักหมุด.*มา/.test(t2),
      why: 'expfee=' + r.status + ' t2=' + t2.slice(0, 60) });
  }
  {
    // k112: กลางโหมดส่งด่วน (รู้ราคา 69) ถาม "ค่าส่งเท่าไหร่" → ตอบ 69 ไม่ใช่ข้อความจัดส่งทั่วไป
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K112b';
    store.set('exp:v20:' + uid, JSON.stringify({ fee: 69, km: 5, lat: 13.7, lng: 100.5, t: Date.now() }));
    sent = [];
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ค่าส่งเท่าไหร่คะ', id: '1' } }, env, 'TOKEN', 'v20');
    const t1 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 136, name: 'k112 รู้ค่าส่งด่วนแล้ว ถามค่าส่ง → ตอบ 69 ตรงๆ ไม่ยิงข้อความจัดส่งรวม+โปรส่งฟรี',
      ok: /69 บาท/.test(t1) && !/รูปแบบการจัดส่งของร้าน/.test(t1),
      why: t1.slice(0, 60) });
  }

  // ── k113 (เคสจริง 2/8 21.26 น.): ส่งด่วนจ่ายแล้ว ให้ชื่อ+เบอร์ → ปิดออเดอร์เลย ไม่ไล่ขอที่อยู่ ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K113';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เม้ง', block: 'รวมยอดชำระ 473\nที่อยู่: (รอลูกค้าแจ้งหลังโอน)', items: [], t: Date.now(), status: 'ชำระแล้ว ✅ ยอด 473 ตรงออเดอร์ (ส่งด่วนตามหมุด 📍 รอชื่อ+เบอร์ผู้รับ)', uid }));
    store.set('exp:v20:' + uid, JSON.stringify({ fee: 123, km: 8, lat: 13.88, lng: 100.56, t: Date.now() }));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ชื่อเม้ง เบอร์ 0959564971', id: '1' } }, env, 'TOKEN', 'v20');
    const t1 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    const oj = JSON.parse(store.get('ord:v20:' + uid) || '{}');
    T.push({ n: 137, name: 'k113 ส่งด่วนจ่ายแล้ว+ให้ชื่อเบอร์ → ปิดออเดอร์ตามหมุด ไม่ถามที่อยู่ต่อ',
      ok: !aiCalled && /พร้อมจัดส่ง/.test(oj.status || '') && /0959564971/.test(oj.block || '') && /maps/.test(oj.block || '') && /ไรเดอร์/.test(t1) && !/ที่อยู่จัดส่ง|รหัสไปรษณีย์/.test(t1),
      why: 'ai=' + aiCalled + ' st=' + (oj.status || '').slice(0, 40) + ' t=' + t1.slice(0, 40) });
  }
  {
    // k113: ถ้า AI เผลอไล่ขอที่อยู่ทั้งที่จ่ายแล้ว+มีหมุด → ตัวกรองขาออกต้องทับด้วยขอชื่อ+เบอร์
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K113b';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เม้ง', block: 'รวมยอดชำระ 473', items: [], t: Date.now(), status: 'ชำระแล้ว ✅ ยอด 473 (ส่งด่วนตามหมุด 📍 รอชื่อ+เบอร์ผู้รับ)', uid }));
    store.set('exp:v20:' + uid, JSON.stringify({ fee: 123, km: 8, lat: 13.88, lng: 100.56, t: Date.now() }));
    sent = []; aiCalled = false; aiReply = 'รบกวนขอที่อยู่จัดส่งค่ะ 🙏🏻 บ้านเลขที่ / เขต/จังหวัด / รหัสไปรษณีย์ ด้วยค่ะ';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ต้องแจ้งอะไรอีกมั้ย', id: '1' } }, env, 'TOKEN', 'v20');
    const t1 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 138, name: 'k113 AI เผลอขอที่อยู่ (จ่ายแล้ว+มีหมุด) → ถูกทับเป็นขอชื่อ+เบอร์ไรเดอร์',
      ok: !/บ้านเลขที่|รหัสไปรษณีย์/.test(t1) && /ชื่อผู้รับ.*เบอร์|ตามหมุด/.test(t1),
      why: t1.slice(0, 60) });
  }

  // ── k114 (เคสจริง 2/8 21.32 น.): สลิปใบเดิมส่งซ้ำทั้งที่จ่ายแล้ว → ยืนยันเฉยๆ ห้ามล้มสถานะ/ห้ามวนขอสลิป ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K114';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เม้ง', block: 'รวมยอดชำระ 473', items: [], t: Date.now(), status: 'ชำระแล้ว ✅ ยอด 473 ตรงออเดอร์ (ส่งด่วนตามหมุด 📍 รอชื่อ+เบอร์ผู้รับ)', uid }));
    store.set('exp:v20:' + uid, JSON.stringify({ fee: 123, km: 8, lat: 13.88, lng: 100.56, t: Date.now() }));
    globalThis.__slipok = { success: false, code: 1012, data: { success: false, code: 1012, message: 'สลิปนี้เคยตรวจสอบแล้ว' } };
    sent = []; aiReply = '[SLIP]';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'image', id: '77' } }, env, 'TOKEN', 'v20');
    globalThis.__slipok = null;
    const t1 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    const oj = JSON.parse(store.get('ord:v20:' + uid) || '{}');
    // ตามด้วย "โอนไปหมดแล้ว" → ต้องไม่ขอสลิปอีก (สถานะ ✅ ต้องยังอยู่)
    sent = [];
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'โอนและส่งที่จัดส่งไปหมดแล้ว', id: '2' } }, env, 'TOKEN', 'v20');
    const t2 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 139, name: 'k114 สลิปซ้ำ+จ่ายแล้ว → ยืนยัน ✅ เดิม ไม่มิ้วต์ ไม่ล้มสถานะ + ทวงต่อไม่โดนขอสลิปใหม่',
      ok: /ชำระเงินเรียบร้อยแล้ว/.test(t1) && /✅/.test(oj.status || '') && !store.has('mute:v20:' + uid) && !/ส่งรูปสลิป/.test(t2),
      why: 't1=' + t1.slice(0, 40) + ' st=' + (oj.status || '').slice(0, 30) + ' t2=' + t2.slice(0, 40) });
  }
  {
    // k114: มิ้วต์ใหม่ต้องเงียบทันทีแม้แคช KV ยังไม่เห็น (จำลอง: ลบคีย์ mute ออกเหมือนแคชค้าง)
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K114b';
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'หัว infinity ใช้กับเครื่อง essential ได้มั้ย', id: '1' } }, env, 'TOKEN', 'v20');
    const muted1 = store.has('mute:v20:' + uid);
    store.delete('mute:v20:' + uid);   // จำลองแคช KV ยังไม่เห็นมิ้วต์
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ได้มั้ยครับ', id: '2' } }, env, 'TOKEN', 'v20');
    T.push({ n: 140, name: 'k114 มิ้วต์ใหม่เงียบทันที (ความจำในเครื่องชนะแคช KV)',
      ok: muted1 && sent.length === 0 && !aiCalled,
      why: 'muted1=' + muted1 + ' sent=' + sent.length + ' ai=' + aiCalled });
  }

  // ── k116: แอดมินแก้เลขบัญชีจากหลังบ้าน → การ์ดโอนเงินใช้บัญชีใหม่ทันที / ล้าง = กลับค่า Cloudflare ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K116';
    // ตั้งบัญชีใหม่ผ่านหลังบ้าน
    let r = await workerApp.fetch(new Request('https://x/ctl/payinfo?key=testkey&shop=v20', { method: 'POST', body: 'ธนาคารกรุงเทพ 999-8-77777-1\nชื่อบัญชี ร้านสาขาใหม่' }), env, { waitUntil: () => {} });
    const rj = await r.json();
    // กันกรอกผิด: ไม่มีเลขบัญชี → ต้องถูกปฏิเสธ
    let r2 = await workerApp.fetch(new Request('https://x/ctl/payinfo?key=testkey&shop=v20', { method: 'POST', body: 'สวัสดีค่ะ' }), env, { waitUntil: () => {} });
    const rj2 = await r2.json();
    // สั่งของ + ยืนยัน → การ์ดเลขบัญชีต้องเป็นบัญชีใหม่
    sent = []; aiCalled = false; aiReply = 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- MARBO 9K | องุ่น | 1';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'เอา มาโบองุ่น 1 อัน', id: '1' } }, env, 'TOKEN', 'v20');
    sent = [];
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ยืนยัน', id: '2' } }, env, 'TOKEN', 'v20');
    const all = JSON.stringify(sent);
    T.push({ n: 141, name: 'k116 แก้บัญชีจากหลังบ้าน → การ์ดโอนใช้บัญชีใหม่ทันที + กันกรอกผิด (ไม่มีเลข = ปฏิเสธ)',
      ok: rj.ok === 1 && /error/.test(JSON.stringify(rj2)) && /999877771|999-8-77777-1/.test(all.replace(/\\/g, '')) && !/ธนาคารเทส 123/.test(all),
      why: 'save=' + (rj.ok === 1) + ' reject=' + /error/.test(JSON.stringify(rj2)) + ' card=' + /999-8-77777-1|999877771/.test(all.replace(/\\/g, '')) });
  }
  {
    // ── k141 (เคสจริง 3/8 19.30): ลูกค้าพิมพ์ "Relx ใช้ทิ้งมีอะไรบ้าง" → ระบบตอบลิสต์กลิ่น MARBO 9K
    //    ด่าน k117 กันได้เฉพาะ "รุ่น" ส่วน "relx" เป็นแบรนด์ที่มีหลายรุ่น → ด่านไม่ทำงาน
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K141';
    sent = []; aiCalled = false;
    aiReply = 'MARBO 9K (350 บาท) กลิ่นที่มีพร้อมส่งค่ะ 💕\n- เบอร์รี่ชมพู\n- เยลลี่\n- สตรอว์เบอร์รี่กีวี่';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'relx ใช้ทิ้ง ตัวไหนน่าสูบ', id: '1' } }, env, 'TOKEN', 'v20');
    const t141 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 162, name: 'k141 ถามแบรนด์ RELX → ห้ามตอบเป็นเรื่อง MARBO ล้วนๆ ต้องลิสต์รุ่น RELX จริง',
      ok: !/MARBO/.test(t141) && /RELX/.test(t141), why: t141.slice(0, 80).replace(/\n/g, ' | ') });
  }
  {
    // ── k152 (เจ้าของร้านยืนยัน 3 ส.ค. 22.55 — ศัพท์ร้าน): "หัวมาโบ" = M SWITCH (บิ๊กพอต) เสมอ
    //    เคสจริง 22.55: ลูกค้า "มีหัวมาโบมั้ยคะ" → บอทตอบ "MARBO 9K (350 บาท)" = พอตทั้งแท่ง ไม่ใช่หัว
    //    ลูกค้าที่มีเครื่องอยู่แล้วซื้อไปใช้ไม่ได้ = เคลม/คืนเงิน
    const head = [['มีหัวมาโบมั้ยคะ', 'M SWITCH'], ['หัวมาโบ', 'M SWITCH'], ['หัวมาร์โบ', 'M SWITCH']];
    const bad152 = head.filter(([t2, w]) => _MODEL_IN(t2) !== w);
    T.push({ n: 180, name: 'k152 "หัวมาโบ" ต้องได้ M SWITCH (บิ๊กพอต) ไม่ใช่ MARBO 9K',
      ok: !bad152.length, why: bad152.map(([t2]) => t2 + ' → "' + _MODEL_IN(t2) + '"').join(' · ') });

    // ต้องไม่ทับกฎเดิม: "มาโบ" ลอยๆ ยังเป็น MARBO 9K · "มาโบซีโร่" ยังเป็นหัวพอต MARBO ZERO
    const keep = [['มาโบ 9', 'MARBO 9K'], ['เอามาโบ องุ่นว่าน', 'MARBO 9K'], ['มาโบซีโร่', 'หัวพอต MARBO ZERO']];
    const bad152b = keep.filter(([t2, w]) => _MODEL_IN(t2) !== w);
    T.push({ n: 181, name: 'k152 กฎเดิมต้องไม่พัง ("มาโบ 9"=MARBO 9K · "มาโบซีโร่"=หัวพอต MARBO ZERO)',
      ok: !bad152b.length, why: bad152b.map(([t2, w]) => t2 + ' → ได้ "' + _MODEL_IN(t2) + '" ควรเป็น ' + w).join(' · ') });
  }
  {
    // ── k150 (เคสจริง 3/8 22.50): ลูกค้า "สตา" → บอทตอบ STAR 2,500 มีของ
    //    ลูกค้าถามต่อ "เหลือกลิ่นไหน" → บอทตอบ "INFY PLUS หมดชั่วคราว" (คนละรุ่น เก่ากว่า 3 เทิร์น)
    //    ลูกค้า "เอาองุ่นว่าน 1" (สั่งของแล้ว) → ยังตอบ INFY PLUS อีก = ออเดอร์หลุดคาแชท
    const h150 = [
      { role: 'user', content: 'ชาจี อินฟี่' },
      { role: 'assistant', content: 'ขออภัยค่ะ หัวพอต INFY PLUS หมดชั่วคราวทุกกลิ่นเลยนะคะ' },
      { role: 'user', content: 'สตา' },
      { role: 'assistant', content: 'รุ่น STAR 2,500 ยังมีของพร้อมส่งค่ะ 💕\n\nมี 12 กลิ่น ราคา 150 บาท รับกลิ่นไหนดีคะ' },
    ];
    const g150 = carryModel('เหลือกลิ่นไหน', h150).trim();
    T.push({ n: 176, name: 'k150 ถามต่อ "เหลือกลิ่นไหน" → ต้องจำ STAR 2,500 ที่คุยค้างอยู่ ไม่ย้อนไป INFY',
      ok: g150 === 'STAR 2,500', why: 'ได้ "' + g150 + '"' });

    // k73 ต้องยังทำงาน: บอทเพิ่งบอกว่าหมด → ห้ามแบกรุ่นนั้นมาใช้ต่อ
    const h150b = [
      { role: 'user', content: 'มาโบ 9k' },
      { role: 'assistant', content: 'MARBO 9K มีกลิ่นที่พร้อมส่งค่ะ - เยลลี่ - องุ่นว่านหางจระเข้' },
      { role: 'user', content: 'เอสโก้' },
      { role: 'assistant', content: 'ขออภัยค่ะ ESKO BAR 20K หมดชั่วคราวทุกกลิ่นเลยนะคะ' },
    ];
    const g150b = carryModel('เหลือกลิ่นไหน', h150b).trim();
    T.push({ n: 177, name: 'k150/k73 บอทเพิ่งบอกว่ารุ่นนั้นหมด → ห้ามหยิบรุ่นนั้นมาตอบต่อ',
      ok: g150b !== 'ESKO BAR 20K', why: 'ได้ "' + g150b + '"' });
  }
  {
    // ── k151 (เจ้าของร้านยืนยัน 3 ส.ค.): โปร "ครบ 1,000 บาท ส่งฟรี" **ไม่มีจริง**
    //    แต่ข้อความโปรที่ส่งหาลูกค้าโฆษณาไว้ 3 จุด (เคสจริง 22.52 ลูกค้าถาม "มีโปรไร" แล้วได้ข้อความนี้)
    const srcs = [PROMO_MSG];
    const bad = srcs.filter(x => /1[,.]?000\s*บาท/.test(String(x)));
    T.push({ n: 178, name: 'k151 ข้อความโปรตายตัว ห้ามมีโปร "ครบ 1,000 บาท ส่งฟรี" ที่ไม่มีจริง',
      ok: !bad.length, why: bad.length ? 'ยังมีอยู่: ' + String(bad[0]).slice(0, 80) : '' });

    // ต้องยังบอกโปรจำนวนชิ้นที่มีจริงครบ
    const need = ['4 แท่ง', '4 ชิ้น', '10 หัว', '2 ชิ้น'];
    const missP = need.filter(x => String(PROMO_MSG).indexOf(x) === -1);
    T.push({ n: 179, name: 'k151 โปรจำนวนชิ้นที่มีจริง (4 แท่ง / 4 ชิ้น / 10 หัว / 2 ชิ้น) ต้องยังอยู่ครบ',
      ok: !missP.length, why: missP.length ? 'หายไป: ' + missP.join(', ') : '' });
  }
  {
    // ── k144 (เคสจริง 3/8): "โอเครวมยอดให้เลย" → ระบบอ่านว่าอยู่ "จังหวัดเลย" = นอกเขตส่งด่วน
    //    ผลคือปฏิเสธส่งด่วนกับลูกค้า กทม. ทันที และล็อกผิดไปทั้งบทสนทนา
    const falsePos = ['โอเครวมยอดให้เลย', 'เอาเลยค่ะ', 'สั่งเลยครับ', 'ได้เลย', 'ไม่มีเลย', 'ยังไม่ได้เลย', 'ตากลม', 'แพร่หลาย', 'สรุปยอดเลย'];
    const bad = falsePos.filter(x => matchUpcountry(x));
    T.push({ n: 166, name: 'k144 คำลงท้าย "เลย/ตาก/แพร่" ต้องไม่ถูกอ่านเป็นชื่อจังหวัด',
      ok: !bad.length, why: bad.length ? 'ยังจับผิด: ' + bad.map(x => x + '→' + matchUpcountry(x)).join(', ') : '' });

    // ต้องยังจับจังหวัดจริงได้ ไม่งั้นด่านส่งด่วนพัง
    const truePos = [['อยู่จังหวัดเลยค่ะ', 'เลย'], ['อยู่ตากครับ', 'ตาก'], ['ส่งไปเชียงใหม่', 'เชียงใหม่'], ['อยู่ขอนแก่น', 'ขอนแก่น'], ['จ.น่าน', 'น่าน'], ['ปลายทางตรัง', 'ตรัง']];
    const miss = truePos.filter(([txt, want]) => matchUpcountry(txt) !== want);
    T.push({ n: 167, name: 'k144 จังหวัดจริงต้องยังจับได้ (อยู่จังหวัดเลย / อยู่ตาก / เชียงใหม่)',
      ok: !miss.length, why: miss.length ? 'จับไม่ได้: ' + miss.map(([t2, w]) => t2 + ' → ได้ "' + matchUpcountry(t2) + '" ควรเป็น ' + w).join(' · ') : '' });
  }
  {
    // ── k145 (เคสจริง 3/8): ลูกค้าไทยพิมพ์ "Marbo 9 k" → ระบบล็อกภาษาเป็นอังกฤษ 7 วัน
    //    → AI ถูกสั่ง "ห้ามตอบภาษาไทย" → ลูกค้าไทยโดนตอบอังกฤษทั้งย่อหน้า
    const thaiCustomer = ['Marbo 9 k', 'MARBO 9K', 'relx infinity', 'ks quik pro', 'boost pod', 'infy 20k'];
    const wrong = thaiCustomer.filter(x => detectLang(x) === 'en');
    T.push({ n: 168, name: 'k145 ลูกค้าพิมพ์ชื่อรุ่นอังกฤษล้วน → ห้ามสลับเป็นโหมดภาษาอังกฤษ',
      ok: !wrong.length, why: wrong.length ? 'ยังสลับเป็น en: ' + wrong.join(', ') : '' });

    // ฝรั่งจริงต้องยังได้ภาษาอังกฤษ
    const realEn = ['do you have marbo in stock', 'how much is shipping', 'hello can i order'];
    const missEn = realEn.filter(x => detectLang(x) !== 'en');
    T.push({ n: 169, name: 'k145 ลูกค้าต่างชาติพิมพ์ประโยคอังกฤษจริง → ต้องยังได้โหมดอังกฤษ',
      ok: !missEn.length, why: missEn.length ? 'ไม่เข้าโหมด en: ' + missEn.join(', ') : '' });
  }
  {
    // ── k146 (เคสจริง 3/8 · /quality นับ "ราคาผิด" 9 ครั้งในวันเดียว):
    //    factGate เห็น "MARBO 9K โคลน 290 บาท" แล้วจับได้แค่คีย์ "MARBO 9K" (350)
    //    → แก้ 290 ที่ถูกอยู่แล้ว ให้กลายเป็น 350 = ด่านกันมั่วสร้างความมั่วเอง
    const r1 = factGate('MARBO 9K โคลน (เทียบแท้) 290 บาทค่ะ');
    T.push({ n: 170, name: 'k146 ราคาโคลน 290 ที่ถูกอยู่แล้ว → ด่านห้ามแก้เป็น 350',
      ok: /290/.test(r1.text) && !/350/.test(r1.text), why: r1.text.slice(0, 70) });

    // เรทขายส่งก็โดนแก้เป็น 350 หมดเหมือนกัน
    const r2 = factGate('เรทขายส่ง MARBO 9K โคลน\n500 แท่งขึ้นไป = 200 บาท/แท่ง\n1000 แท่งขึ้นไป = 190 บาท/แท่ง');
    T.push({ n: 171, name: 'k146 เรทขายส่ง 200/190 บาทต่อแท่ง → ด่านห้ามแก้เป็น 350',
      ok: /200/.test(r2.text) && /190/.test(r2.text), why: r2.text.replace(/\n/g, ' | ').slice(0, 90) });

    // ต้องยังแก้ราคาที่ผิดจริงได้ (ไม่ใช่ปิดด่านทิ้ง)
    const r3 = factGate('MARBO 9K ราคา 999 บาทค่ะ');
    T.push({ n: 172, name: 'k146 ราคาที่ผิดจริงต้องยังถูกแก้ (999 → 350) ด่านไม่ตายไปเลย',
      ok: /350/.test(r3.text) && !/999/.test(r3.text), why: r3.text.slice(0, 70) });

    // k146b: findPrice ต้องแยกโคลนออกจากแท้ แม้ AI ไม่ใส่วงเล็บ
    const fp = findPrice('MARBO 9K โคลน');
    T.push({ n: 173, name: 'k146b findPrice("MARBO 9K โคลน") ต้องได้ 290 ไม่ใช่ 350 (คิดเงินในการ์ด)',
      ok: fp && fp.price === 290, why: fp ? fp.key + ' = ' + fp.price : 'หาไม่เจอ' });
  }
  {
    // ── k147 (เคสจริง 3/8 — แย่ที่สุดของวัน): ลูกค้า "โอนตังค์คืนได้ไหมไม่อยากได้แล้ว"
    //    → บอทตอบ fallback "ไม่เข้าใจคำถาม + ลิงก์เมนู" วน 2 รอบ จนลูกค้าพิมพ์ "ไม่ให้อภัยตอบมา"
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K147';
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'โอนตังค์คืนได้ไหมไม่อยากได้แล้ว', id: '1' } }, env, 'TOKEN', 'v20');
    const t147 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    let r147 = ''; try { r147 = JSON.parse(store.get('mute:v20:' + uid) || '{}').reason || ''; } catch (e) {}
    T.push({ n: 174, name: 'k147 ขอเงินคืน → เข้าคิวคนจริง + ห้ามยิงลิงก์เมนูใส่',
      ok: !!r147 && !/cutt\.ly/.test(t147), why: 'คิว="' + r147.slice(0, 30) + '" ตอบ=' + t147.slice(0, 60).replace(/\n/g, ' ') });

    // k147b: "โอนคืน" เฉยๆ (ไม่มีคำว่าเงิน/ตังค์คั่น) เดิมหลุดด่าน
    store = new Map(); store.set('stockmap', JSON.stringify(stockmap));
    const uid2 = 'K147b';
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid2 }, message: { type: 'text', text: 'ขอโอนคืนได้มั้ยคะ', id: '1' } }, env, 'TOKEN', 'v20');
    let r147b = ''; try { r147b = JSON.parse(store.get('mute:v20:' + uid2) || '{}').reason || ''; } catch (e) {}
    T.push({ n: 175, name: 'k147b คำว่า "โอนคืน" (ไม่มีคำว่าเงินคั่น) ต้องเข้าคิวคนจริงด้วย',
      ok: !!r147b, why: 'คิว="' + r147b.slice(0, 40) + '"' });
  }
  {
    // ── k143 (เคสจริง 3/8): ลูกค้าถาม "มีหัวแบบสูบแล้วทิ้งไหม" → บอทตอบ "MARBO 9K เป็นพอตใช้แล้วทิ้ง"
    //    MARBO 9K = พอตทั้งแท่ง ไม่ใช่หัว → ลูกค้ามีเครื่องอยู่แล้วซื้อไปใช้ไม่ได้ = เคลม/คืนเงิน
    //    ด่านระดับ 4 (หมวด): ถามหมวดไหน คำตอบต้องมีรุ่นในหมวดนั้นอย่างน้อย 1 รุ่น
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K143';
    sent = []; aiCalled = false;
    aiReply = 'มีค่ะ 💕 MARBO 9K เป็นพอตใช้แล้วทิ้ง สูบหมดแล้วทิ้งได้เลยค่ะ สนใจกลิ่นไหนดีคะ';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'มีหัวแบบสูบแล้วทิ้งไหมคะ', id: '1' } }, env, 'TOKEN', 'v20');
    const t143 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 163, name: 'k143 ถาม "หัวแบบสูบแล้วทิ้ง" → ห้ามยัดพอตทั้งแท่งมาเป็นหัว ต้องอธิบาย+ลิสต์หัวพอตจริง',
      ok: !/MARBO 9K/.test(t143) && /แบบเติม/.test(t143) && /(BOOST POD|INFY PLUS|RELX INFINITY|M SWITCH|ABC TANK)/.test(t143),
      why: t143.slice(0, 100).replace(/\n/g, ' | ') });
  }
  {
    // k143b: ถาม "สูบแล้วทิ้ง" เฉยๆ แล้ว AI ตอบพอตใช้แล้วทิ้งถูกหมวดอยู่แล้ว → ด่านห้ามแตะ (กันด่านตีมั่ว)
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K143b';
    sent = []; aiCalled = false;
    aiReply = 'แนะนำ MARBO 9K (350 บาท) พอตใช้แล้วทิ้งขายดีสุดค่ะ 💕 สนใจกลิ่นไหนดีคะ';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'พอตแบบสูบแล้วทิ้ง ตัวไหนขายดีสุด', id: '1' } }, env, 'TOKEN', 'v20');
    const t143b = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 164, name: 'k143b ถามพอตใช้แล้วทิ้ง แล้ว AI ตอบถูกหมวดอยู่แล้ว → ด่านต้องไม่แตะคำตอบ',
      ok: /MARBO 9K/.test(t143b), why: t143b.slice(0, 80).replace(/\n/g, ' | ') });
  }
  {
    // k143c: ถาม "สูบแล้วทิ้ง" แต่ AI หลุดไปเสนอหัวเติม → ต้องถูกแทนด้วยลิสต์พอตใช้แล้วทิ้งจริง
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K143c';
    sent = []; aiCalled = false;
    aiReply = 'แนะนำ RELX BOOST POD ค่ะ 💕 สูบง่าย สะดวกมากค่ะ สนใจไหมคะ';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'อยากได้แบบใช้แล้วทิ้ง มีอะไรแนะนำ', id: '1' } }, env, 'TOKEN', 'v20');
    const t143c = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 165, name: 'k143c ถามใช้แล้วทิ้ง แต่ AI เสนอหัวเติม BOOST POD → แทนด้วยลิสต์พอตใช้แล้วทิ้งจริง',
      ok: !/BOOST POD/.test(t143c) && /ใช้แล้วทิ้ง/.test(t143c) && /บาท\)/.test(t143c),
      why: t143c.slice(0, 100).replace(/\n/g, ' | ') });
  }
  {
    // ── k140 (เคสจริง 3/8 18.49): คุย INFY 20K ชานมชาจีอยู่ → ลูกค้าตอบ "รับค่า เอา 4 แท่ง"
    //    ระบบตอบ "หัวพอต INFY PLUS หมดชั่วคราวทุกกลิ่น" = คนละรุ่น ลูกค้าต้องทักท้วง "แอดมินเป็นอะไรคะ"
    const h140 = [
      { role: 'user', content: 'ชานมชาจี เป็นยังไงจ้ะ' },
      { role: 'assistant', content: 'กลิ่นชานมชาจีของ INFY 20K จะเป็นแนวชานมรสชาติหอมมัน หวานกำลังดี สูบเพลินๆ ค่ะ' },
    ];
    const got140 = carryModel('รับค่า เอา 4 แท่ง', h140).trim();
    T.push({ n: 161, name: 'k140 ตอบรับ+จำนวนลอยๆ ("เอา 4 แท่ง") → จำได้ว่าคุย INFY 20K ไม่หลุดไปหัวพอต INFY PLUS',
      ok: got140 === 'INFY 20K', why: 'ได้ "' + got140 + '"' });
  }
  {
    // ── k137 (เคสจริง 3/8 18.29): ลูกค้าขอคุยกับคนจริง 3 รอบ บอทตอบ "ทีมงานกำลังเดินทางมาแล้ว"
    //    แต่ไม่เคยส่งเข้าคิวแอดมินเลย = โกหกลูกค้า + ร้านไม่รู้ว่ามีคนรออยู่
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K137';
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'เรียกมาเลยค่ะ', id: '1' } }, env, 'TOKEN', 'v20');
    const t137 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    let r137 = ''; try { r137 = JSON.parse(store.get('mute:v20:' + uid) || '{}').reason || ''; } catch (e) {}
    T.push({ n: 159, name: 'k137 ลูกค้าขอคุยกับคนจริง → เข้าคิวแอดมินจริง ไม่ใช่แค่รับปาก',
      ok: /คนจริง/.test(r137) && /ทีมงาน/.test(t137), why: 'reason=' + r137.slice(0, 30) });
  }
  {
    // k137b: AI รับปากว่าทีมงานกำลังมา แต่ไม่มีอะไรเข้าคิว → ระบบต้องบังคับเข้าคิวให้
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K137b';
    sent = []; aiCalled = false;
    aiReply = 'รอสักครู่นะคะ 🙏 ทีมงานคนจริงกำลังจะเข้ามาดูแลให้บริการค่ะ 💕';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ช่วยเช็คออเดอร์เก่าให้หน่อยสิ', id: '1' } }, env, 'TOKEN', 'v20');
    T.push({ n: 160, name: 'k137 บอทรับปาก "ทีมงานกำลังมา" → ระบบบังคับเข้าคิวจริง',
      ok: store.has('mute:v20:' + uid), why: 'muted=' + store.has('mute:v20:' + uid) });
  }
  {
    // ── k136a (เคสจริง 3/8 12.55): "สินค้าที่เปลี่ยนหัวน้ำยามีแบรนด์ไหนบ้างคะ" → ระบบส่งคู่มือวิธีใช้งาน
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K136a';
    sent = []; aiCalled = false; aiReply = 'หัวแบบเติมน้ำยาเองมี RELX BOOST POD, ABC LEGO 20K, RELX POD CLEAR 18K ค่ะ';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'สินค้าที่เปลี่ยนหัวน้ำยามีแบรนด์ไหนบ้างคะ', id: '1' } }, env, 'TOKEN', 'v20');
    const t136a = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 157, name: 'k136 ถาม "เปลี่ยนหัวน้ำยามีแบรนด์ไหนบ้าง" → ตอบรายชื่อรุ่น ไม่ใช่คู่มือวิธีใช้',
      ok: !/วิธีใช้งานเบื้องต้น/.test(t136a), why: t136a.slice(0, 60).replace(/\n/g, ' | ') });
  }
  {
    // ── k135 (เคสจริง 3/8 18.08): "สั่งชุดKit เอกโคบาร์กลิ่นสตอเบอรี่ 10แท่ง" = ครบทั้งรุ่น+กลิ่น+จำนวน
    //    ระบบตอบ "มีชุด KIT 4 รุ่น หมายถึงรุ่นไหนคะ" แล้วขอรุ่น/กลิ่น/จำนวนใหม่ (ลูกค้าบอกไปหมดแล้ว)
    //    ต้นเหตุ: สะกด "เอกโคบาร์" (ไม่ใช่ เอสโค่บาร์) → จับแบรนด์ไม่ได้ + ไม่รู้ว่า "ชุด KIT" = รุ่น (KIT)
    const c135 = [
      ['สั่งชุดKit เอกโคบาร์กลิ่นสตอเบอรี่ 10แท่ง', 'ESKO BAR SWITCH 20K (KIT)'],
      ['ชุด kit เอสโค่', 'ESKO BAR SWITCH 20K (KIT)'],
      ['ชุดคิท m switch', 'M SWITCH 15K (KIT)'],
      ['ks quik pro kit', 'KS QUIK PRO 15K (KIT)'],
      ['ชุด kit vazer', 'VAZER RELOAD 15K (KIT)'],
      ['เอสโค่บาร์', 'ESKO BAR SWITCH 20K'],
      ['มาโบ 9k', 'MARBO 9K'],
    ];
    const bad135 = c135.filter(([q, w]) => _MODEL_IN(q) !== w).map(([q, w]) => q + '→' + (_MODEL_IN(q) || 'ไม่เจอ') + ' (ควร ' + w + ')');
    T.push({ n: 156, name: 'k135 "ชุด KIT + แบรนด์" → รุ่น (KIT) ถูกตัว + รู้จักคำสะกดเพี้ยน เอกโค/เอคโค',
      ok: bad135.length === 0, why: bad135.join(' | ') || 'ถูกทุกข้อ' });
  }
  {
    // ── k134 (เคสจริง 3/8 17.56): การ์ด 823 (รวมค่าส่งด่วน 123) ออกแล้ว ลูกค้าถาม "ได้ของกี่โมง"
    //    ระบบดันตอบ "รบกวนแชร์โลเคชั่น เดี๋ยวทีมงานเช็คค่าส่งด่วน" = ย้อนกลับไป 3 ก้าว
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K134';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'location', latitude: 13.75, longitude: 100.5, id: '1' } }, env, 'TOKEN', 'v20');
    await workerApp.fetch(new Request('https://x/expfee?key=testkey&shop=v20&uid=' + uid + '&fee=123'), env, { waitUntil: () => {} });
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ได้ของกี่โมง', id: '2' } }, env, 'TOKEN', 'v20');
    const t134 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 154, name: 'k134 รู้ค่าส่งด่วนแล้ว ถาม "ได้ของกี่โมง" → ตอบรอบส่ง ห้ามขอหมุดซ้ำ',
      ok: !/แชร์โลเคชั่น|ปักหมุด/.test(t134) && /รอบส่ง|1-3 ชม/.test(t134),
      why: t134.slice(0, 80).replace(/\n/g, ' | ') });
  }
  {
    // k134b: ด่านขาออก — ต่อให้ AI เผลอขอหมุด ระบบต้องทับทิ้ง
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K134b';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'location', latitude: 13.75, longitude: 100.5, id: '1' } }, env, 'TOKEN', 'v20');
    await workerApp.fetch(new Request('https://x/expfee?key=testkey&shop=v20&uid=' + uid + '&fee=123'), env, { waitUntil: () => {} });
    sent = []; aiCalled = false;
    aiReply = 'รบกวนแชร์โลเคชั่น (ปักหมุด) มาให้หน่อยนะคะ เดี๋ยวทีมงานเช็คค่าส่งด่วนให้ค่ะ';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'แล้วส่งถึงประมาณไหนคะ', id: '2' } }, env, 'TOKEN', 'v20');
    const t134b = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 155, name: 'k134 AI เผลอขอหมุดซ้ำทั้งที่รู้ค่าส่งแล้ว → ด่านขาออกทับทิ้ง',
      ok: !/แชร์โลเคชั่น|ปักหมุด/.test(t134b) && /123/.test(t134b),
      why: t134b.slice(0, 80).replace(/\n/g, ' | ') });
  }
  {
    // ── k133 (เคสจริง 3/8 17.41): "MARBO 9K แท้ของหมดทุกรสชาติค่ะ" ทั้งที่ยังมี 7 กลิ่น
    //    แถมข้อความถัดมาบอกหมด แล้วลิสต์กลิ่นที่มีของต่อทันที = ขัดกันเองในข้อความเดียว
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K133';
    sent = []; aiCalled = false;
    aiReply = 'ขออภัยนะคะ 🙏 ตอนนี้ MARBO 9K แท้ของหมดทุกรสชาติค่ะ รอของเข้าอยู่';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'มาโบ 9k ตัวแท้ยังมีมั้ยคะ', id: '1' } }, env, 'TOKEN', 'v20');
    const t133 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 152, name: 'k133 บอก "หมดทุกรสชาติ" ทั้งที่ยังมีของ → ต้องแก้เป็นหมดบางกลิ่น + ลิสต์ของจริง',
      ok: !/หมดทุกรสชาติ/.test(t133) && /ยังมีของ/.test(t133), why: t133.slice(0, 90).replace(/\n/g, ' | ') });
  }
  {
    // k133b: ขัดกันเองในข้อความเดียว — บอกรุ่นนี้หมด แล้วลิสต์กลิ่นที่มีของต่อ
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K133b';
    sent = []; aiCalled = false;
    aiReply = 'ขออภัยนะคะ 🙏 MARBO 9K ตอนนี้หมดชั่วคราวค่ะ\n\nตอนนี้ MARBO 9K กลิ่นที่มีของค่ะ:\n- บลูไอซ์\n- เยลลี่\n- องุ่น';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ทำไมสินค้าหมดไวจังค่ะ มาโบ 9k ตัวแท้นะคะ', id: '1' } }, env, 'TOKEN', 'v20');
    const t133b = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 153, name: 'k133 ขัดกันเอง (บอกหมด+ลิสต์กลิ่นที่มี) → ตัดประโยคที่บอกหมดทิ้ง',
      ok: !/MARBO 9K ตอนนี้หมดชั่วคราว/.test(t133b) && /บลูไอซ์/.test(t133b),
      why: t133b.slice(0, 80).replace(/\n/g, ' | ') });
  }
  {
    // ── k129 (เคสจริง 3/8 16.04): บอทลิสต์กลิ่น MARBO 9K → ลูกค้าตอบ "- เยลลี่ 1" (สั่งเลย)
    //    ระบบลืมบริบท ไปถามใหม่ว่า "มี 2 รุ่นที่มีกลิ่นเยลลี่ รับรุ่นไหนดีคะ" = ถอยหลัง
    const h129 = [
      { role: 'user', content: 'มาโบเหลือไร' },
      { role: 'assistant', content: 'MARBO 9K (350 บาท) ตอนนี้มีกลิ่นดังนี้ค่ะ 💕\n- บลูไอซ์\n- เยลลี่\n- สตรอว์เบอร์รี่กีวี่' },
    ];
    const got129 = carryModel('- เยลลี่ 1', h129).trim();
    // กันเดามั่ว: ถ้าบอทลิสต์หลายรุ่น ต้องไม่เดา
    const h129b = [
      { role: 'assistant', content: 'มี 2 รุ่นค่ะ MARBO 9K (350 บาท) และ RELX SPARTA 20K (399 บาท)' },
    ];
    const got129b = carryModel('- เยลลี่ 1', h129b).trim();
    T.push({ n: 151, name: 'k129 ลูกค้าตอบ "- เยลลี่ 1" ต่อจากลิสต์กลิ่น → จำได้ว่าคุย MARBO 9K อยู่ (และไม่เดาถ้ากำกวม)',
      ok: got129 === 'MARBO 9K' && got129b === '', why: 'ได้ "' + got129 + '" / กำกวมได้ "' + got129b + '"' });
  }
  {
    // ── k127 (เคสจริง 3/8 15.05): "โอนตังค์คืนได้ไหมไม่อยากได้แล้ว" → ระบบตอบ "ไม่เข้าใจ" 2 รอบ ลูกค้าโกรธ
    //    เรื่องเงินคืน = ต้องส่งคนทันที ไม่ว่าจะมีคำว่า "ได้ไหม" หรือไม่
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K127';
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'โอนตังค์คืนได้ไหมไม่อยากได้แล้ว', id: '1' } }, env, 'TOKEN', 'v20');
    const t127 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    let r127 = ''; try { r127 = JSON.parse(store.get('mute:v20:' + uid) || '{}').reason || ''; } catch (e) {}
    T.push({ n: 149, name: 'k127 ขอเงินคืน → ส่งเข้าคิวแอดมินทันที ไม่ตอบ "ไม่เข้าใจ"',
      ok: /เงินคืน/.test(r127) && /ทีมงาน/.test(t127) && !/ไม่เข้าใจคำถาม|พิมพ์ถามใหม่/.test(t127),
      why: 'reason=' + r127.slice(0, 30) + ' | ' + t127.slice(0, 50).replace(/\n/g, ' ') });
  }
  {
    // k127b: ลูกค้าไม่พอใจ → ต้องส่งคน ไม่ยิงข้อความสำเร็จรูปซ้ำ
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K127b';
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ทำไมไม่เข้าใจ ตอบไม่ตรงเลย', id: '1' } }, env, 'TOKEN', 'v20');
    const t127b = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 150, name: 'k127 ลูกค้าไม่พอใจ → ส่งคนเข้าไปคุย ไม่ยิงข้อความสำเร็จรูปซ้ำ',
      ok: store.has('mute:v20:' + uid) && /ทีมงาน/.test(t127b),
      why: 'muted=' + store.has('mute:v20:' + uid) + ' | ' + t127b.slice(0, 50).replace(/\n/g, ' ') });
  }
  {
    // ── k126 (เคสจริง 3/8 15.03): "อินฟี่ 20เค เหลือกลิ่นไหนมั่ง" → ระบบตอบ RELX SMASH GO 12K
    //    2 ต้นเหตุ: (1) คนไทยเขียน K เป็น "เค" ระบบอ่านไม่ออก (2) "อินฟี่" ลอยๆ ชี้ไปหัวพอต INFY PLUS
    const cases126 = [
      ['อินฟี่ 20เค เหลือกลิ่นไหนมั่ง', 'INFY 20K'],
      ['อินฟี่ 12เค', 'INFY 12K'],
      ['อินฟี่บาร์โปร มีกลิ่นอะไร', 'INFY BAR PRO 20K'],
      ['อินฟี่บาร์ 15เค', 'INFY BAR 15K'],
      ['มาโบ 9เค', 'MARBO 9K'],
    ];
    const bad126 = cases126.filter(([q, want]) => _MODEL_IN(q) !== want).map(([q, want]) => q + '→' + (_MODEL_IN(q) || 'ไม่เจอ') + ' (ควรเป็น ' + want + ')');
    T.push({ n: 148, name: 'k126 อ่าน "เค" เป็น K + แยกรุ่นตระกูล INFY ให้ถูกตัว',
      ok: bad126.length === 0, why: bad126.join(' | ') || 'ถูกทุกข้อ' });
  }
  {
    // ── k125 (เคสจริง 3/8 14.16): ลูกค้าพิมพ์ "ตังแท้ก้ได้ครับ" (ตอบเรื่องแท้/โคลน ไม่ได้เลือกกลิ่น)
    //    แต่ระบบเลือกกลิ่นให้เองแล้วออกการ์ด 740 บาท → ลูกค้าอาจโอนเงินซื้อของที่ไม่ได้สั่ง
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K125';
    sent = []; aiCalled = false;
    aiReply = 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- MARBO 9K | บลูไอซ์ | 1\n- MARBO 9K | องุ่นว่านหางจระเข้ | 1';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ตังแท้ก้ได้ครับ', id: '1' } }, env, 'TOKEN', 'v20');
    const f125 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'flex');
    const t125 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 146, name: 'k125 ลูกค้ายังไม่ได้เลือกกลิ่น → ห้ามออกการ์ด ต้องถามกลิ่นก่อน',
      ok: f125.length === 0 && /กลิ่น/.test(t125) && !store.has('ord:v20:' + uid),
      why: 'flex=' + f125.length + ' | ' + t125.slice(0, 70).replace(/\n/g, ' ') });
  }
  {
    // k125b: ลูกค้าพิมพ์กลิ่นเองชัดเจน → การ์ดต้องออกปกติ ด่านห้ามขวางคนที่สั่งจริง
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K125b';
    sent = []; aiCalled = false;
    aiReply = 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- MARBO 9K | องุ่น | 2';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'เอา มาโบองุ่น 2 อัน', id: '1' } }, env, 'TOKEN', 'v20');
    const f125b = sent.flatMap(b => b.messages || []).filter(m => m.type === 'flex');
    T.push({ n: 147, name: 'k125 ลูกค้าพิมพ์กลิ่นเอง → การ์ดออกปกติ (ด่านไม่ขวางคนสั่งจริง)',
      ok: f125b.length === 1, why: 'flex=' + f125b.length });
  }
  {
    // ── k124: แอดมินกรอกเลขพัสดุ → ลูกค้าได้เลข + ถาม "ของถึงไหน" ทีหลัง ระบบตอบเองได้ ──
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K124';
    sent = [];
    const rTk = await workerApp.fetch(new Request('https://x/track?key=testkey&shop=v20&uid=' + uid + '&no=TH01234567890&c=flash'), env, { waitUntil: () => {} });
    const jTk = await rTk.json();
    const pushed = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    // กรอกเลขมั่ว (สั้นเกิน) ต้องถูกปฏิเสธ ไม่ส่งให้ลูกค้า
    const rBad = await workerApp.fetch(new Request('https://x/track?key=testkey&shop=v20&uid=' + uid + '&no=123&c=flash'), env, { waitUntil: () => {} });
    T.push({ n: 144, name: 'k124 แอดมินกรอกเลขพัสดุ → ส่งเลข+ลิงก์ให้ลูกค้า + กันกรอกเลขมั่ว',
      ok: /TH01234567890/.test(pushed) && /http/.test(pushed) && rBad.status === 400 && !/Flash|Kerry|เคอรี่|แฟลช/i.test(pushed.replace(/https?:\/\/\S+/g, '')),
      why: pushed.slice(0, 70).replace(/\n/g, ' | ') + ' bad=' + rBad.status });
    // ลูกค้าถามทีหลัง → ต้องตอบเลขเดิมได้เอง ไม่เข้าคิวแอดมิน
    sent = [];
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ของถึงไหนแล้วคะ', id: '9' } }, env, 'TOKEN', 'v20');
    const tAsk = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 145, name: 'k124 ลูกค้าถาม "ของถึงไหน" → ระบบตอบเลขพัสดุเองได้ ไม่ต้องรบกวนแอดมิน',
      ok: /TH01234567890/.test(tAsk) && !/Flash|Kerry|เคอรี่|แฟลช/i.test(tAsk.replace(/https?:\/\/\S+/g, '')),
      why: tAsk.slice(0, 70).replace(/\n/g, ' | ') });
  }
  {
    // ── k123 (เคสจริง 3/8 13.53): "เอาเลโก้องุ่น1" → ระบบตอบ "รุ่น ELFBAR 15K กลิ่นองุ่นหมด" = คนละตระกูล
    //    หัวเลโก้ = หัวเติมน้ำยาเอง 3 ยี่ห้อเท่านั้น (BOOST POD / POD CLEAR / ABC LEGO)
    //    คำตอบห้ามเอ่ยรุ่นนอกตระกูล ถ้าเอ่ย = ระบบต้องเขียนใหม่จากสต็อกจริง
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K123';
    sent = []; aiCalled = false;
    aiReply = 'ขออภัยค่ะ รุ่น ELFBAR 15K กลิ่นองุ่นหมดชั่วคราวนะคะ 🙏';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'เอาเลโก้องุ่น1', id: '1' } }, env, 'TOKEN', 'v20');
    const t123 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 142, name: 'k123 ถาม "เลโก้องุ่น" → ห้ามตอบ ELFBAR/รุ่นนอกตระกูล ต้องเสนอหัวเติม 3 ยี่ห้อ',
      ok: !/ELFBAR/i.test(t123) && /BOOST POD/i.test(t123) && /ABC LEGO/i.test(t123) && /POD CLEAR/i.test(t123),
      why: t123.slice(0, 90).replace(/\n/g, ' | ') });
  }
  {
    // k123b: ลูกค้าระบุยี่ห้อมาเอง ("หัวเลโก้ abc") → ด่านต้องไม่แทรก ปล่อยระบบปกติทำงาน
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K123b';
    sent = []; aiCalled = false;
    aiReply = 'ABC LEGO 20K กลิ่นองุ่น 3% มีของค่ะ 299 บาท 💕';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'หัวเลโก้ abc องุ่นมีมั้ย', id: '1' } }, env, 'TOKEN', 'v20');
    const t123b = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 143, name: 'k123 ระบุยี่ห้อเอง (เลโก้ abc) → ด่านไม่แทรก ตอบ ABC LEGO ตรงคำถาม',
      ok: /ABC LEGO/i.test(t123b), why: t123b.slice(0, 80).replace(/\n/g, ' | ') });
  }
  {
    // k102: สั่งธรรมดา (ไม่พูดส่งด่วน) → การ์ดออกปกติค่าส่ง 40
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K102b';
    sent = []; aiCalled = false; aiReply = 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- MARBO 9K | องุ่น | 2';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'เอา มาโบองุ่น 2 อัน', id: '1' } }, env, 'TOKEN', 'v20');
    const flex = sent.flatMap(b => b.messages || []).filter(m => m.type === 'flex');
    T.push({ n: 125, name: 'k102 สั่งธรรมดา → การ์ดออกปกติ', ok: flex.length === 1, why: 'flex=' + flex.length });
  }

  // ── k101 (เคสจริง 2/8): ปักหมุดต่างจังหวัด (พิจิตร ~358 กม.) → ต้องแจ้งนอกเขต ไม่เข้าคิวเช็คราคา ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K101';
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'location', latitude: 16.44, longitude: 100.35, id: '1' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    let _ozE = {}; try { _ozE = JSON.parse(store.get('exp:v20:' + uid) || '{}'); } catch (e) {}
    T.push({ n: 122, name: 'k101+k112 หมุดต่างจังหวัด → แจ้งนอกเขต+เสนอพัสดุ ไม่เข้าคิว + เก็บ marker นอกเขต (กันแอดมินกรอกราคา)',
      ok: /นอกเขตส่งด่วน/.test(txt) && /พัสดุ/.test(txt) && _ozE.outzone === true && !_ozE.pending && !store.has('mute:v20:' + uid),
      why: txt.slice(0, 70) + ' oz=' + JSON.stringify(_ozE).slice(0, 40) + ' mute=' + store.has('mute:v20:' + uid) });
  }
  {
    // k101: หมุดใน กทม. → ยังรับปกติ เข้าคิวเช็คราคา
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K101b';
    sent = [];
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'location', latitude: 13.75, longitude: 100.5, id: '1' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 123, name: 'k101 หมุด กทม. → รับพิกัดปกติ เข้าคิวเช็คราคา', ok: /รับพิกัด/.test(txt) && store.has('exp:v20:' + uid), why: txt.slice(0, 60) });
  }

  // ── k86 (จากตัวจำลองลูกค้า): มิ้วต์เหตุ "เช็คค่าส่งด่วน" ต้องไม่ปิดปากจีทู — ลูกค้าสั่งของต่อได้ ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K86';
    store.set('mute:v20:' + uid, JSON.stringify({ name: 'เทส', reason: 'เช็คค่าส่งด่วนจากแอป 🛵 (~5 กม.)', msg: '', t: Date.now(), uid }));
    store.set('exp:v20:' + uid, JSON.stringify({ pending: true, km: 5, t: Date.now() }));
    sent = []; aiCalled = false; aiReply = 'ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾\n- MARBO 9K | องุ่น | 1';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'เอา MARBO 9K องุ่น 1 อัน', id: '1' } }, env, 'TOKEN', 'v20');
    const flex = sent.flatMap(b => b.messages || []).filter(m => m.type === 'flex');
    // (อัพเดตตาม k102: หมุดรอราคาอยู่ → รับรายการไว้ ไม่ออกการ์ดจนกว่ารู้ค่าส่งด่วน — แต่ต้องไม่เงียบ)
    const txt86 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 115, name: 'k86+k102 มิ้วต์เช็คค่าส่งด่วน → จีทูรับออเดอร์ไว้ (ไม่เงียบ ไม่ออกการ์ดก่อนรู้ราคา)', ok: sent.length > 0 && /รับออเดอร์ไว้แล้ว/.test(txt86) && !!store.get('ord:v20:' + uid), why: 'sent=' + sent.length + ' txt=' + txt86.slice(0, 60) });
  }
  {
    // k86: มิ้วต์เหตุอื่น (เคสปัญหา) → ยังเงียบให้แอดมินดูแลเหมือนเดิม
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K86b';
    store.set('mute:v20:' + uid, JSON.stringify({ name: 'เทส', reason: 'ขอยกเลิกออเดอร์ ⚠️', msg: '', t: Date.now(), uid }));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'สวัสดี', id: '1' } }, env, 'TOKEN', 'v20');
    T.push({ n: 116, name: 'k86 มิ้วต์เคสปัญหา → ยังเงียบให้แอดมินดูแล', ok: sent.length === 0 && !aiCalled, why: 'sent=' + sent.length });
  }

  // ── k84 (เคสจริง 2/8): จ่ายแล้ว + ระบบถามที่เดิม + ลูกค้าตอบ "โอเค" → ต้องปิดออเดอร์ ไม่ใช่การ์ดเลขบัญชีซ้ำ ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K84';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: '📦 ออเดอร์ (รอโอน)\n- MARBO 9K องุ่น x1 = 350\nยอดสินค้า 350\nค่าส่ง 40\nรวมยอดชำระ 390\nที่อยู่: (รอลูกค้าแจ้งหลังโอน)', items: [], t: Date.now(), status: 'ชำระแล้ว ✅ ยอด 390 ตรงออเดอร์ (รอที่อยู่จัดส่ง)', uid }));
    store.set('cust:v20:' + uid, JSON.stringify({ name: 'สุธีมนต์', tel: '0830217378', addr: 'ห้องพักสมบูรณ์ 165 ม 11 บ้านค่าย ระยอง 21120' }));
    store.set('card:v20:' + uid, JSON.stringify({ sig: 'x#390', t: Date.now() }));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'โอเค', id: '1' } }, env, 'TOKEN', 'v20');
    const flex = sent.flatMap(b => b.messages || []).filter(m => m.type === 'flex');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    const o2 = JSON.parse(store.get('ord:v20:' + uid) || '{}');
    T.push({ n: 113, name: 'k84 จ่ายแล้ว+ตอบ "โอเค" → ปิดออเดอร์ที่เดิม ไม่ส่งการ์ดเลขบัญชีซ้ำ',
      ok: !flex.length && /ส่งที่เดิม/.test(txt) && /พร้อมจัดส่ง/.test(o2.status || '') && !aiCalled,
      why: 'flex=' + flex.length + ' txt=' + txt.slice(0, 60) + ' st=' + (o2.status || '') });
  }
  {
    // k84: จ่ายแล้ว+ปิดออเดอร์แล้ว (พร้อมจัดส่ง) + พิมพ์ยืนยันซ้ำ → แจ้งสถานะ ไม่ทำอะไรซ้ำ
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K84b';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: 'รวมยอดชำระ 390', items: [], t: Date.now(), status: 'ชำระแล้ว ✅ (พร้อมจัดส่ง)', uid }));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ยืนยัน', id: '1' } }, env, 'TOKEN', 'v20');
    const flex = sent.flatMap(b => b.messages || []).filter(m => m.type === 'flex');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 114, name: 'k84 ปิดออเดอร์แล้ว+ยืนยันซ้ำ → แจ้งว่าเรียบร้อย รอรับสินค้า', ok: !flex.length && /เรียบร้อย/.test(txt), why: txt.slice(0, 60) });
  }

  // ── k81: ยืนยัน "โอนแล้ว" รอบ 2 → เด้งคิวแอดมินด่วน / จ่ายแล้วจริง → ยืนยัน+ขอที่อยู่ ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K81';
    store.set('paidclaim:v20:' + uid, '1');
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'โอนไปแล้วนะครับ', id: '1' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    const q = store.get('mute:v20:' + uid) || '';
    T.push({ n: 108, name: 'k81 ยืนยันโอนแล้วรอบ 2 → เด้งคิวแอดมินด่วน 💸', ok: !aiCalled && /(?:แอดมิน|ทีมงาน)/.test(txt) && /ยังไม่พบสลิป/.test(q), why: 'out=' + txt.slice(0, 50) + ' q=' + String(q).slice(0, 60) });
  }
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K81b';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: 'รวมยอดชำระ 390', items: [], t: Date.now(), status: 'ชำระแล้ว ✅ ยอด 390 (รอที่อยู่)', uid }));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'โอนแล้วนะ', id: '1' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 109, name: 'k81 จ่ายแล้วจริง + บอกโอนแล้ว → ยืนยัน + ขอที่อยู่', ok: !aiCalled && /เรียบร้อยแล้ว/.test(txt) && /ที่อยู่/.test(txt), why: txt.slice(0, 70) });
  }

  // ── k80 (เคสจริง 2/8 เจ้านายเทสโอนจริง): รูปตอน "รอโอน" ต้องวิ่งเข้าตรวจสลิปทันที ไม่พึ่ง vision ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K80';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: 'รวมยอดชำระ 320', items: [], t: Date.now(), status: 'รอโอน 💰', uid }));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'image', id: '99' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    // k156: เดิมเทสนี้ยืนยันว่า "ห้ามเรียก vision" — แต่นั่นคือต้นเหตุบั๊กเคส JW 3/8 23.58
    //   (รูปเมนูโดนเหมาเป็นสลิปหมด) ตอนนี้ให้ vision ดูก่อนเสมอ
    //   สิ่งที่ต้องกันคือ "ผลลัพธ์" ไม่ใช่ "วิธีการ": ลูกค้าโอนเงินแล้วต้องไม่โดนเมินเด็ดขาด
    T.push({ n: 105, name: 'k80 ส่งรูปตอนรอโอน + vision ดูไม่ออก → ยังเข้าทางสลิป ไม่เมินลูกค้า',
      ok: /สลิป/.test(txt) && !/เข้าใจคำถามไม่ตรง|cutt\.ly/.test(txt),
      why: 'out=' + txt.slice(0, 70) });
  }

  // ── k156 (เคสจริง 3/8 23.58 JW): รอโอนค้างอยู่ แต่ลูกค้าส่ง "รูปเมนู" มาถามกลิ่นต่อ ──
  //    ต้องตอบเรื่องสินค้า ⛔ ห้ามตอบว่า "ได้รับสลิปแล้ว" และห้ามเด้งเคสด่วนปลอมเข้าหลังบ้าน
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K156';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: 'รวมยอดชำระ 1400', items: [], t: Date.now(), status: 'รอโอน 💰', uid }));
    sent = []; aiCalled = false;
    const prevReply = aiReply;
    aiReply = 'จากรูปเห็นเป็น DUAL SMASH 20K ค่ะ 💕 กลิ่นที่วงไว้คือ ชาหลงจิน กับ สตรอว์เบอร์รี่ รับอย่างละกี่ชิ้นดีคะ';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'image', id: '98' } }, env, 'TOKEN', 'v20');
    const txt2 = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    aiReply = prevReply;
    T.push({ n: 106.5, name: 'k156 รอโอนค้าง + ส่งรูปเมนู → ตอบเรื่องสินค้า ห้ามตอบว่าเป็นสลิป',
      ok: !/ได้รับสลิป|ตรวจอัตโนมัติไม่สำเร็จ|QR/.test(txt2) && /DUAL SMASH|กลิ่น/.test(txt2),
      why: 'out=' + txt2.slice(0, 90) });
  }
  {
    // k80: ไม่มีออเดอร์ → รูปยังไปทาง vision ตามปกติ
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K80b';
    sent = []; aiCalled = false; aiReply = 'ในรูปเป็นเมนูของร้านค่ะ สนใจรุ่นไหนแจ้งได้เลยนะคะ 💕';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'image', id: '98' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 106, name: 'k80 ไม่มีออเดอร์ → รูปไปทาง vision ปกติ', ok: aiCalled && !/รูปโหลดไม่ได้/.test(txt), why: 'ai=' + aiCalled + ' out=' + txt.slice(0, 60) });
  }
  {
    // k80: vision พูดถึงสลิปแต่ลืมแท็ก [SLIP] → นับเป็นสลิป
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    const uid = 'K80c';
    sent = []; aiCalled = false; aiReply = 'ได้รับสลิปโอนเงินแล้วค่ะ เดี๋ยวทีมงานหลังการขายตรวจสอบให้นะคะ';
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'image', id: '97' } }, env, 'TOKEN', 'v20');
    const txt = sent.flatMap(b => b.messages || []).filter(m => m.type === 'text').map(m => m.text).join('\n');
    T.push({ n: 107, name: 'k80 vision ลืมแท็ก [SLIP] แต่พูดถึงสลิป → เข้าทางสลิป ไม่หลุดเป็นรูปทั่วไป',
      ok: /สลิป/.test(txt) && !/เข้าใจคำถามไม่ตรง|cutt\.ly/.test(txt), why: txt.slice(0, 70) });
  }

  // ── k78 (เคสจริง 1/8): "ส่งพัสดุครับ" หลังการ์ดส่งด่วน (570) → ต้องออกการ์ดใหม่ยอดพัสดุ (390) ──
  {
    store = new Map();
    store.set('stockmap', JSON.stringify(stockmap));
    store.set('stockbuffer', '1');
    const uid = 'K78';
    store.set('ord:v20:' + uid, JSON.stringify({ name: 'เทส', block: '📦 ออเดอร์ (รอโอน)\n- MARBO 9K (แท้) องุ่น x1 = 350\nยอดสินค้า 350\nค่าส่งด่วน 220\nรวมยอดชำระ 570\nที่อยู่: (รอลูกค้าแจ้งหลังโอน)', items: [{ model: 'MARBO 9K', flavor: 'องุ่น', qty: 1 }], t: Date.now(), status: 'รอโอน 💰', uid }));
    store.set('exp:v20:' + uid, JSON.stringify({ fee: 220, km: 11 }));
    store.set('card:v20:' + uid, JSON.stringify({ sig: 'x#570', t: Date.now() }));
    sent = []; aiCalled = false;
    await handleEvent({ type: 'message', replyToken: 'rt', source: { userId: uid }, message: { type: 'text', text: 'ส่งพัสดุครับ', id: '1' } }, env, 'TOKEN', 'v20');
    const flex = sent.flatMap(b => b.messages || []).filter(m => m.type === 'flex');
    const ord2 = JSON.parse(store.get('ord:v20:' + uid) || '{}');
    T.push({ n: 102, name: 'k78 "ส่งพัสดุครับ" ตอนมีออเดอร์ค้าง → การ์ดใหม่ + ord เป็น 390 + ล้าง exp + ไม่เรียก AI',
      ok: flex.length === 1 && /รวมยอดชำระ 390/.test(ord2.block || '') && !store.has('exp:v20:' + uid) && !aiCalled,
      why: 'flex=' + flex.length + ' block=…' + String(ord2.block).slice(-45) + ' expเหลือ=' + store.has('exp:v20:' + uid) + ' ai=' + aiCalled });
  }
  {
    // k78: "ส่งพัสดุครับ" ตอน "ไม่มี" ออเดอร์ค้าง → ตอบตายตัวเดิม ไม่เรียก AI ไม่มีการ์ด
    const r = await run('ส่งพัสดุครับ', 'AI ห้ามถูกเรียก');
    T.push({ n: 103, name: 'k78 "ส่งพัสดุครับ" ไม่มีออเดอร์ → ตอบตายตัว 40 บาท ไม่เรียก AI',
      ok: /พัสดุปกติ/.test(r.out) && /40 บาท/.test(r.out) && !r.aiCalled && r.out.indexOf('[การ์ด]') === -1,
      why: r.out.slice(0, 80) + ' ai=' + r.aiCalled });
  }

  // ── k73 (เคสจริง 1/8 ยุค Qwen): "พอดเคลีย/สแมช" ไม่รู้จัก + แบก ESKO ที่หมดมาตอบวน ──
  {
    const ok = carryModel('เหลือกลิ่นไหน', [
      { role: 'user', content: 'พอดเคลียมีตัวไหน' },
      { role: 'assistant', content: 'ขออภัยค่ะ หัว ESKO BAR SWITCH 20K หมดทุกกลิ่นชั่วคราวนะคะ' },
    ]);
    T.push({ n: 97, name: '"พอดเคลีย" → รู้จักเป็น RELX POD CLEAR (ไม่ใช่แบก ESKO)', ok: /POD CLEAR/.test(ok) && !/ESKO/.test(ok), why: 'ได้ "' + ok + '"' });
  }
  {
    // บอทเพิ่งขอโทษว่า ESKO หมด → ห้ามเอา ESKO มาตอบต่อ
    const ok = carryModel('เหลือกลิ่นไหนบ้าง', [
      { role: 'user', content: 'มีของมั้ย' },
      { role: 'assistant', content: 'ขออภัยค่ะ หัว ESKO BAR SWITCH 20K หมดทุกกลิ่นชั่วคราวนะคะ' },
    ]);
    T.push({ n: 98, name: 'บอทเพิ่งบอก ESKO หมด → ห้ามแบก ESKO มาตอบซ้ำ', ok: !/ESKO/.test(ok), why: 'ยังแบกมา: "' + ok + '"' });
  }

  // ── k70: หมวดสินค้าต้องถูก ไม่งั้นคิดโปรส่งฟรีผิด (บั๊กเสียเงินจริง) ──
  {
    const want = { 'หัวพอต RELX INFINITY':'smallpod','หัวพอต MARBO ZERO':'smallpod','หัวพอต INFY PLUS':'smallpod',
                   'หัวพอต RELX ULTRA':'smallpod','MARBO 9K':'disp','RELX BOOST POD':'bigpod','ABC LEGO 20K':'bigpod',
                   'ไส้บุหรี่ IQOS JP':'iqos','เครื่อง RELX CREATOR 20K':'device' };
    const bad = Object.keys(want).filter(k => catOf(k) !== want[k]);
    T.push({ n: 92, name: 'จัดหมวดสินค้าถูกทุกแบบ (หัวเล็ก/บิ๊กพอต/สูบทิ้ง/IQOS)', ok: !bad.length,
             why: bad.map(k => k + ' → ' + catOf(k) + ' (ควรเป็น ' + want[k] + ')').join(', ') });
  }
  {
    const f = n => computeOrder([{ model: 'หัวพอต RELX INFINITY', flavor: 'องุ่น 3%', qty: n }], null).ship;
    const ok = f(4) === 40 && f(9) === 40 && f(10) === 0;
    T.push({ n: 93, name: 'หัวพอตเล็กต้องครบ 10 หัวถึงส่งฟรี (ไม่ใช่ 4)', ok,
             why: '4หัว=' + f(4) + ' 9หัว=' + f(9) + ' 10หัว=' + f(10) });
  }
  // ── k70: ค้นตามแนวกลิ่น — ต้องได้กลิ่นจริงเท่านั้น ──
  {
    const SM3 = JSON.parse(JSON.stringify(stockmap));
    const h = styleHint('มาโบ 9k ชอบแนวเย็นๆหวานๆ', SM3, 1);
    const real = (FLAVORS['MARBO 9K'].f || []);
    const named = (h.match(/• ([^\n·]+)/g) || []).map(x => x.replace('• ', '').trim());
    const fake = named.filter(x => x && !real.some(r => r.indexOf(x) !== -1 || x.indexOf(r) !== -1));
    T.push({ n: 94, name: 'ถาม "แนวเย็นๆหวานๆ" → ได้กลิ่นจริงของ MARBO 9K เท่านั้น',
             ok: /เย็น|มิ้นต์/.test(h) && !fake.length, why: fake.length ? 'มีกลิ่นปลอม: ' + fake.join(', ') : 'ไม่เจอแนวเย็น' });
  }
  {
    const SM3 = JSON.parse(JSON.stringify(stockmap));
    const h = styleHint('สูบทิ้งอันไหนเย็นๆคะ', SM3, 1);
    T.push({ n: 95, name: 'ถาม "สูบทิ้ง" → ต้องไม่โผล่หัวพอตมาปน', ok: !/หัวพอต/.test(h), why: 'มีหัวพอตปนมา' });
  }
  {
    const h = styleHint('สวัสดีครับ', JSON.parse(JSON.stringify(stockmap)), 1);
    T.push({ n: 96, name: 'ทักทายเฉยๆ → ไม่เด้งลิสต์กลิ่น', ok: h === '', why: 'เด้งผิดจังหวะ' });
  }

  // ── k69 (เคสจริง 1/8 ยุค Qwen): ห้ามหยิบรุ่นจาก "ข้อความที่บอทพิมพ์เอง" ──
  {
    const h = [
      { role: 'user', content: 'มาโบ 9k มีไรบ้าง' },
      { role: 'assistant', content: 'ถ้าสนใจหัวเติม แนะนำ RELX BOOST POD ค่ะ' },
    ];
    const got = carryModel('แล้วเหลือไร', h);
    const ok = /MARBO 9K/i.test(got) && !/BOOST/i.test(got);
    T.push({ n: 90, name: 'ถาม "แล้วเหลือไร" → จำรุ่นที่ลูกค้าพูด ไม่ใช่ที่บอทเชียร์', ok, why: ok ? '' : 'หยิบรุ่นจากปากบอท: "' + got + '"' });
  }
  {
    // ลูกค้าไม่เคยเอ่ยรุ่นเลย → ยอมใช้ของบอทได้ (ดีกว่าไม่มีข้อมูลเลย)
    const h = [
      { role: 'user', content: 'มีอะไรขายบ้าง' },
      { role: 'assistant', content: 'แนะนำ MARBO 9K ค่ะ' },
    ];
    const got = carryModel('เหลือกลิ่นไหนบ้าง', h);
    T.push({ n: 91, name: 'ลูกค้าไม่เคยเอ่ยรุ่น → ใช้รุ่นที่บอทเพิ่งแนะนำได้', ok: /MARBO 9K/.test(got), why: 'ได้ "' + got + '"' });
  }

  // ── k67: ค้นย้อนกลับ "กลิ่น → รุ่นไหนมีบ้าง" (เคสจริง 1/8 "มิ้นฟรีซ มีรุ่นไหนบ้าง") ──
  const SM2 = JSON.parse(JSON.stringify(stockmap));
  {
    const h = flavorSearchHint('มิ้นฟรีซ มีรุ่นไหนบ้าง', SM2, 1);   // พิมพ์ตกตัวการันต์
    const ok = /มิ้นต์ฟรีซ/.test(h) && /RELX INFINITY|MARBO ZERO/.test(h) && !/บลูไอซ์|ชานมอู่หลง/.test(h);
    T.push({ n: 80, name: 'ถาม "มิ้นฟรีซ รุ่นไหนบ้าง" → ได้รุ่นที่มีกลิ่นนี้จริง', ok, why: ok ? '' : 'ได้: ' + h.slice(0, 200) });
  }
  {
    const h = flavorSearchHint('MARBO 9K มีกลิ่นอะไรบ้าง', SM2, 1);
    T.push({ n: 81, name: 'ระบุรุ่นมาแล้ว → ไม่ต้องค้นย้อนกลับ', ok: h === '', why: h === '' ? '' : 'ยัดข้อมูลซ้ำ' });
  }
  {
    const h = flavorSearchHint('สวัสดีครับ', SM2, 1);
    T.push({ n: 82, name: 'ทักทายเฉยๆ → ไม่เด้ง', ok: h === '', why: h === '' ? '' : 'เด้งผิดจังหวะ' });
  }
  // ── k56: "หัวเลโก้ 3 ยี่ห้อ" — เลิกตอบตายตัว แต่ข้อมูลต้องถึง AI ครบ ──
  // (เคสจริง 31/7: ตอบแค่ "ABC LEGO หมดทุกกลิ่น" ทั้งที่อีก 2 ยี่ห้อมีของเต็ม = เสียยอด)
  const SM = JSON.parse(JSON.stringify(stockmap));
  {
    const h = legoHint('เลโก้ เหลืออะไรบ้าง', SM, 1);
    const ok = /RELX BOOST POD/.test(h) && /RELX POD CLEAR/.test(h) && /ABC LEGO/.test(h)
      && /✅ มีของ/.test(h) && /❌ หมดชั่วคราว/.test(h) && /ห้ามตอบแค่ยี่ห้อเดียว/.test(h);
    T.push({ n: 64, name: 'ถาม "เลโก้" ลอยๆ → ส่งครบ 3 ยี่ห้อ + สถานะจริง', ok, why: ok ? '' : 'ข้อมูลไม่ครบ: ' + h.slice(0, 160) });
  }
  {
    const h = legoHint('เอาเลโก้องุ่น', SM, 1);
    const ok = /องุ่น/.test(h) && /RELX BOOST POD/.test(h) && /ABC LEGO/.test(h);
    T.push({ n: 65, name: 'ระบุกลิ่น "องุ่น" → เช็คกลิ่นนั้นทั้ง 3 ยี่ห้อ', ok, why: ok ? '' : 'ไม่เจาะกลิ่น: ' + h.slice(0, 160) });
  }
  {
    const h = legoHint('ABC LEGO มีกลิ่นอะไรบ้าง', SM, 1);
    T.push({ n: 66, name: 'ระบุยี่ห้อมาแล้ว → ห้ามยัดลิสต์ 3 ยี่ห้อซ้ำ', ok: h === '', why: h === '' ? '' : 'ยังยัดลิสต์มา' });
  }
  {
    const h = legoHint('มีบุหรี่ไฟฟ้าอะไรบ้าง', SM, 1);
    T.push({ n: 67, name: 'ไม่ได้ถามหัวเติม → ไม่ยุ่ง', ok: h === '', why: h === '' ? '' : 'เด้งผิดจังหวะ' });
  }
  {
    const h = legoHint('หัวเติมน้ำยาเอง', SM, 1);
    // "ครบ 4 ชิ้นส่งฟรี" = เงื่อนไขโปร ไม่ใช่สต็อก — ที่ห้ามคือ "มีของ 88 ชิ้น"
    T.push({ n: 68, name: 'ห้ามหลุดจำนวนสต็อกเป็นชิ้น', ok: !/(มีของ|เหลือ|สต็อก)\s*\d+\s*(ชิ้น|อัน|หัว)/.test(h), why: 'มีเลขจำนวนสต็อกหลุด' });
  }
  return T;
}

// ═══ k65: ลูกค้าส่งสติกเกอร์ ต้องไม่เงียบใส่ (และต้องไม่เผาเงิน AI) ═══
{
  const S = [
    { kw: ['Thank you'], name: 'สติกเกอร์ขอบคุณ', want: /ยินดี/ },
    { kw: ['OK'],        name: 'สติกเกอร์ OK',    want: /รับทราบ/ },
    { kw: ['Hello'],     name: 'สติกเกอร์ทักทาย', want: /สวัสดี/ },
    { kw: [],            name: 'สติกเกอร์ทั่วไป (ไม่มี keyword)', want: /./ },
  ];
  for (let i = 0; i < S.length; i++) {
    const c = S[i];
    const r = await runSticker(c.kw);
    const why = [];
    if (!r.out.trim()) why.push('เงียบใส่ลูกค้า ไม่ตอบอะไรเลย');
    if (r.aiCalled) why.push('เรียก AI ทั้งที่ควรตอบตายตัว (เปลืองเงิน)');
    if (r.out.trim() && !c.want.test(r.out)) why.push('ตอบไม่ตรงอารมณ์สติกเกอร์: ' + r.out.slice(0, 40));
    const n = 70 + i;
    if (!why.length) { pass++; console.log(`${GRN}✅ ${n}${RESET} ${DIM}[สติกเกอร์]${RESET} ${c.name}`); }
    else { fails.push({ n: String(n), c: { ask: c.name }, why, out: r.out }); console.log(`${RED}❌ ${n}${RESET} ${DIM}[สติกเกอร์]${RESET} ${c.name}`); for (const w of why) console.log(`      ${RED}\u2193${RESET} ${w}`); }
  }
}

for (const t of await memTests()) {
  if (t.ok) { pass++; console.log(`${GRN}✅ ${t.n}${RESET} ${DIM}[ความจำ]${RESET} ${t.name}`); }
  else { fails.push({ n: String(t.n), c: { ask: t.name }, why: [t.why], out: '' }); console.log(`${RED}❌ ${t.n}${RESET} ${DIM}[ความจำ]${RESET} ${t.name}\n      ${RED}\u2193${RESET} ${t.why}`); }
}
// ═══ k157: รุ่น+กลิ่นอยู่เทิร์นก่อน เหลือแค่จำนวน → ต้องออกการ์ด ไม่ใช่ถามซ้ำ ═══
//   เคสจริง 4/8 00.03-00.07 (m): บอกครบ 4 รอบ แชร์หมุดแล้ว คิดค่าส่ง 66 บาทแล้ว การ์ดไม่เคยออก
{
  const T = [];
  const t = (n, name, ok, why) => T.push({ n, name, ok, why: ok ? '' : why });
  const tag = h => /ห้ามลิสต์กลิ่นซ้ำ/.test(h) ? (/ออกบล็อกทวนคำสั่งซื้อได้เลย/.test(h) ? 'การ์ด' : 'ถามจำนวน')
    : (/ลิสต์กลิ่นไม่เกิน 10/.test(h) ? 'ลิสต์กลิ่น' : '-');
  // บอทเพิ่งยืนยันกลิ่นเดียวชัดๆ แล้วถามจำนวน
  const H = [{ role: 'user', content: 'มาโบ ว่านหาง' },
             { role: 'assistant', content: 'มีค่ะ 💕 MARBO 9K (350 บาท) กลิ่นองุ่นว่านหางจระเข้มีของพร้อมส่งค่ะ รับกี่ชิ้นดีคะ' }];
  const run = s => tag(flavorHint(s + carryFlavor(s, H), stockmap, 1));

  t(252, 'เคสจริง "1ชิ้น ส่งแกรปครับ" (บอกแค่จำนวน) → ต้องออกการ์ด', run('1ชิ้น ส่งแกรปครับ') === 'การ์ด', 'ได้ ' + run('1ชิ้น ส่งแกรปครับ') + ' = วนถามซ้ำ ออเดอร์ไม่ปิด');
  t(253, 'เคสจริง "มาโบว่านท่าง 1ชิ้น" (สะกดเพี้ยน) → ต้องออกการ์ด', run('มาโบว่านท่าง 1ชิ้น') === 'การ์ด', 'ได้ ' + run('มาโบว่านท่าง 1ชิ้น'));
  t(254, 'เคสจริง "มาโบว่านหาง 1 ชิ้น ส่งแกรป" → ต้องออกการ์ด', run('มาโบว่านหาง 1 ชิ้น ส่งแกรป') === 'การ์ด', 'ได้ ' + run('มาโบว่านหาง 1 ชิ้น ส่งแกรป'));
  t(255, 'ยังไม่บอกจำนวน ("รับครับ") → ถามจำนวน ไม่เดาเป็น 1', run('รับครับ') === 'ถามจำนวน', 'ได้ ' + run('รับครับ'));

  // ⚠️ ห้ามพากลิ่นเก่ามาทับเมื่อลูกค้าเปลี่ยนใจเอง
  t(256, 'ลูกค้าเปลี่ยนกลิ่นเอง → ห้ามพากลิ่นเก่ามาทับ', carryFlavor('เอาองุ่นลิ้นจี่ 2 ชิ้น', H) === '', 'ทับกลิ่นที่ลูกค้าเพิ่งเปลี่ยน = ส่งผิดกลิ่น');
  // ⚠️ บทเรียน k69/k150: ห้ามหยิบรุ่น/กลิ่นจากประโยคที่บอกว่าของหมด
  t(257, 'บอทเพิ่งบอกว่ากลิ่นนั้นหมด → ห้ามพามา', carryFlavor('1 ชิ้น', [{ role: 'assistant', content: 'ขออภัยค่ะ MARBO 9K กลิ่นองุ่นว่านหางจระเข้ ของหมดชั่วคราวค่ะ' }]) === '', 'พากลิ่นที่หมดมาออกการ์ด');
  t(258, 'บอทลิสต์หลายกลิ่น (ลูกค้ายังไม่เลือก) → ห้ามเดา', carryFlavor('1 ชิ้น', [{ role: 'assistant', content: 'MARBO 9K มีกลิ่น องุ่น · แตงโม · โคล่า ค่ะ รับกี่ชิ้นดีคะ' }]) === '', 'เดากลิ่นแทนลูกค้า');
  t(259, 'เทิร์นล่าสุดเป็นของลูกค้า (ไม่ใช่บอท) → ไม่พาอะไรมา', carryFlavor('1 ชิ้น', [{ role: 'user', content: 'มาโบ' }]) === '', 'หยิบผิดฝั่ง');

  for (const x of T) {
    if (x.ok) { pass++; console.log(`${GRN}✅ ${x.n}${RESET} ${DIM}[ปิดการขาย]${RESET} ${x.name}`); }
    else { fails.push({ n: String(x.n), c: { ask: x.name }, why: [x.why], out: '' }); console.log(`${RED}❌ ${x.n}${RESET} ${DIM}[ปิดการขาย]${RESET} ${x.name}\n      ${RED}↓${RESET} ${x.why}`); }
  }
}

// ═══ k156: มีออเดอร์รอโอนค้าง ห้ามเหมาว่าทุกรูปคือสลิป ═══
//   เคสจริง 3/8 23.58 (JW): สั่ง BOOST POD ไว้ (รอโอน) แล้วส่งรูปเมนู BIG POD วงกลิ่นไว้มาถามต่อ
//   → "ได้รับสลิปแล้วนะคะ ระบบตรวจอัตโนมัติไม่สำเร็จ" + เคสด่วนปลอม "code 1007: รูปภาพไม่มี QR Code"
{
  const T = [];
  const t = (n, name, ok, why) => T.push({ n, name, ok, why: ok ? '' : why });

  // vision อ่านออกว่าเป็นเมนู/สินค้า → ห้ามเหมาเป็นสลิป
  t(246, 'เคสจริง: vision อ่านเมนูที่วงไว้ออก → ไม่ใช่สลิป',
    slipVisionClear('จากรูปเห็นเป็น DUAL SMASH 20K ค่ะ 💕 กลิ่นที่วงไว้คือ ชาหลงจิน กับ สตรอว์เบอร์รี่ รับอย่างละกี่ชิ้นดีคะ') === true, 'ยังโดนเหมาเป็นสลิป');
  t(247, 'vision อ่านรูปสินค้าจริงออก → ไม่ใช่สลิป',
    slipVisionClear('จากรูปเห็น M SWITCH 15K และ RELX BOOST POD ค่ะ สนใจตัวไหน กลิ่นอะไร กี่ชิ้นดีคะ') === true, 'ยังโดนเหมาเป็นสลิป');
  t(248, 'vision ขอให้ถ่ายใหม่เพราะเบลอ (พูดถึงรุ่น) → ไม่ใช่สลิป',
    slipVisionClear('รบกวนถ่ายให้เห็นชื่อรุ่นบนกล่องชัดๆ อีกครั้ง หรือพิมพ์ชื่อรุ่นมาก็ได้นะคะ 🙏🏻') === true, 'ยังโดนเหมาเป็นสลิป');

  // ⚠️ ห้ามถอดตาข่าย k80 — สลิปจริงที่ vision อ่านไม่ออก ยังต้องเข้าทางตรวจสลิป
  t(249, 'k80 ไม่ถอยหลัง: vision ตอบว่าง → ยังถือเป็นสลิป', slipVisionClear('') === false, 'สลิปจริงหลุด = ลูกค้าโอนแล้วโดนเมิน');
  t(250, 'k80 ไม่ถอยหลัง: vision ตอบสั้นจนไม่มีเนื้อหา → ยังถือเป็นสลิป', slipVisionClear('ไม่ทราบค่ะ') === false, 'สลิปจริงหลุด');
  t(251, 'k80 ไม่ถอยหลัง: vision ตอบกำกวมไม่พูดถึงรุ่น/กลิ่น → ยังถือเป็นสลิป', slipVisionClear('ขออภัยค่ะ ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งนะคะ') === false, 'สลิปจริงหลุด');

  for (const x of T) {
    if (x.ok) { pass++; console.log(`${GRN}✅ ${x.n}${RESET} ${DIM}[รูป/สลิป]${RESET} ${x.name}`); }
    else { fails.push({ n: String(x.n), c: { ask: x.name }, why: [x.why], out: '' }); console.log(`${RED}❌ ${x.n}${RESET} ${DIM}[รูป/สลิป]${RESET} ${x.name}\n      ${RED}↓${RESET} ${x.why}`); }
  }
}

// ═══ k155: ห้ามอ้างถึงรูปที่ลูกค้าไม่เคยส่ง ═══
//   เคสจริง 3/8 23.51 (C•): ลูกค้าพิมพ์ "Relx" แล้ว "รุ่นนี้" ติดกัน → "Relx" หายจากความจำ (ความจำถูกทับ)
//   → AI เห็นแค่ [แอดมิน: ส่งรูปสินค้ามาได้เลยค่ะ] [ลูกค้า: รุ่นนี้] → กุเองว่า "แอดมินไม่เห็นรูปที่ส่งมานะคะ"
{
  const T = [];
  const t = (n, name, ok, why) => T.push({ n, name, ok, why: ok ? '' : why });
  const real = 'ขออภัยค่ะคุณลูกค้า แอดมินไม่เห็นรูปที่ส่งมานะคะ รบกวนส่งรูปอีกครั้ง หรือพิมพ์ชื่อรุ่นมาได้เลยค่ะ 🙏🏻';
  const histNoImg = [
    { role: 'user', content: 'มีของเข้ามั้ยครับ' },
    { role: 'assistant', content: 'รบกวนพิมพ์ชื่อรุ่นอีกครั้ง หรือส่งรูปสินค้ามาได้เลยค่ะ 🙏🏻' },
    { role: 'user', content: 'รุ่นนี้' },
  ];
  const g1 = ghostImageGate(real, histNoImg, 'text');
  t(238, 'เคสจริง: ลูกค้าไม่เคยส่งรูป → ห้ามบอกว่า "ไม่เห็นรูปที่ส่งมา"', g1.blocked && !/ไม่เห็นรูป/.test(g1.reply), 'ยังหลุดถึงลูกค้า');
  t(239, 'เคสจริง: ห้ามสั่งให้ "ส่งรูปอีกครั้ง" ในสิ่งที่ไม่เคยทำ', !/ส่งรูปอีกครั้ง/.test(g1.reply), 'ยังสั่งให้ทำซ้ำ');
  t(240, 'เคสจริง: ต้องยังชวนคุยต่อได้ (ไม่เงียบใส่ลูกค้า)', /พิมพ์ชื่อรุ่น/.test(g1.reply), 'ตัดทิ้งจนคุยต่อไม่ได้');

  const histImg = histNoImg.concat([{ role: 'user', content: '[ลูกค้าส่งรูปเมนู/สินค้าที่วงกลมไว้ — รุ่นที่อยู่ในรูป: RELX BOOST POD]' }]);
  t(241, 'ลูกค้าเคยส่งรูปจริง → พูดถึงรูปได้ตามปกติ', ghostImageGate(real, histImg, 'text').blocked === false, 'ด่านทำงานผิดจังหวะ');
  t(242, 'ลูกค้ากำลังส่งรูปมาในเทิร์นนี้ → ห้ามแตะ', ghostImageGate(real, histNoImg, 'image').blocked === false, 'บล็อกตอนลูกค้าส่งรูปจริง');
  t(243, 'ลูกค้าเคยส่งรูปแบบ content ไม่ใช่ข้อความ → พูดถึงได้', ghostImageGate(real, histNoImg.concat([{ role: 'user', content: [{ type: 'image_url' }] }]), 'text').blocked === false, 'อ่านรูปแบบ vision ไม่ออก');

  const ok = 'RELX BOOST POD 350 บาทค่ะ 💕 รับกลิ่นไหนดีคะ';
  t(244, 'ข้อความปกติที่ไม่พูดถึงรูป ห้ามโดนแตะ', ghostImageGate(ok, histNoImg, 'text').reply === ok, 'ไปแก้ข้อความที่ถูกอยู่แล้ว');
  const askPic = 'รบกวนพิมพ์ชื่อรุ่นอีกครั้ง หรือส่งรูปสินค้ามาได้เลยค่ะ 🙏🏻';
  t(245, 'ชวนให้ส่งรูป (ยังไม่เคยส่ง) = ถูกต้อง ห้ามบล็อก', ghostImageGate(askPic, histNoImg, 'text').blocked === false, 'บล็อกประโยคที่ถูก');

  for (const x of T) {
    if (x.ok) { pass++; console.log(`${GRN}✅ ${x.n}${RESET} ${DIM}[ความจำ/รูป]${RESET} ${x.name}`); }
    else { fails.push({ n: String(x.n), c: { ask: x.name }, why: [x.why], out: '' }); console.log(`${RED}❌ ${x.n}${RESET} ${DIM}[ความจำ/รูป]${RESET} ${x.name}\n      ${RED}↓${RESET} ${x.why}`); }
  }
}

// ═══ k154: ลูกค้าบอกข้อมูลครบแล้ว ห้ามถามซ้ำ / ห้ามลืม ═══
//   เคสจริง 3/8 23.10 (JW): "เอาบูสพอดจ้ะ" → ตอบ "ESKO BAR SWITCH หมดชั่วคราว" (รุ่นจาก 3 เทิร์นก่อน)
//   เคสจริง 3/8 22.50 (m): "เอามาโบ องุ่นว่าน" → ตอบลิสต์กลิ่นแล้วถามกลิ่นซ้ำ → ลูกค้าเงียบหาย = ออเดอร์หลุด
{
  const T = [];
  const t = (n, name, ok, why) => T.push({ n, name, ok, why: ok ? '' : why });
  const tag = h => /ห้ามลิสต์กลิ่นซ้ำ/.test(h) ? (/ออกบล็อกทวนคำสั่งซื้อได้เลย/.test(h) ? 'การ์ด' : 'ถามจำนวน')
    : (/กลิ่นนี้หมด/.test(h) ? 'บอกหมด' : (/ลิสต์กลิ่นไม่เกิน 10/.test(h) ? 'ลิสต์กลิ่น' : '-'));
  const lock = h => (h.match(/ระบุกลิ่นมาแล้ว = \*\*(.+?)\*\*/) || [])[1] || '';

  // ── ตัวจับรุ่นต้องทนคำสะกดเพี้ยน (ด/ต · ไม้ไต่คู้) ──
  t(223, 'เคสจริง "เอาบูสพอดจ้ะ" (ด.เด็ก) → RELX BOOST POD', _MODEL_IN('เอาบูสพอดจ้ะ') === 'RELX BOOST POD', 'ได้ ' + (_MODEL_IN('เอาบูสพอดจ้ะ') || '(ไม่เจอ)'));
  t(224, 'เคสจริง "เอารีแล็คบูสพอด" (มีไม้ไต่คู้) → RELX BOOST POD', _MODEL_IN('เอารีแล็คบูสพอด') === 'RELX BOOST POD', 'ได้ ' + (_MODEL_IN('เอารีแล็คบูสพอด') || '(ไม่เจอ)'));
  t(225, 'สะกดถูกแบบเดิม "บูสพอต" ต้องยังใช้ได้', _MODEL_IN('บูสพอต') === 'RELX BOOST POD', 'ของเดิมพัง');
  t(226, 'k152 ไม่ถอยหลัง: "หัวมาโบ" ยังต้องได้ M SWITCH', _MODEL_IN('หัวมาโบ 15K ค่ะ') === 'M SWITCH', 'ทับกฎ k152');
  t(227, 'k126 ไม่ถอยหลัง: "อินฟี่ 20เค" ยังต้องได้ INFY 20K', _MODEL_IN('อินฟี่ 20เค เหลือกลิ่นไหน') === 'INFY 20K', 'ได้ ' + _MODEL_IN('อินฟี่ 20เค เหลือกลิ่นไหน'));
  t(228, 'foldTH ไม่ทำลายข้อความปกติ', foldTH('เอาแตงโม 2 แท่ง').includes('แตงโม'), 'ข้อความเพี้ยน');

  // ── ลูกค้าบอกกลิ่นแล้ว ห้ามลิสต์กลิ่นซ้ำ ──
  const h1 = flavorHint('เอามาโบ องุ่นว่าน', stockmap, 1);
  t(229, 'เคสจริง "เอามาโบ องุ่นว่าน" → ล็อกกลิ่นได้ ไม่ลิสต์ซ้ำ', tag(h1) === 'ถามจำนวน', 'ได้ ' + tag(h1));
  t(230, 'เคสจริง: ล็อกถูกกลิ่น (องุ่นว่านหางจระเข้ ไม่ใช่ องุ่น)', lock(h1) === 'MARBO 9K | องุ่นว่านหางจระเข้', 'ได้ ' + lock(h1));
  t(231, 'เคสจริง: สั่งให้ถามแค่จำนวน ไม่ถามกลิ่นซ้ำ', /รับกี่ชิ้นดีคะ/.test(h1) && /ห้ามถามว่า 'รับกลิ่นไหนดีคะ'/.test(h1), 'ยังถามกลิ่นซ้ำได้');

  const h2 = flavorHint('เอามาโบ องุ่นว่าน 3 แท่ง', stockmap, 1);
  t(232, 'ครบ รุ่น+กลิ่น+จำนวน → บอกให้ออกการ์ดเลย', tag(h2) === 'การ์ด' && /\(3\)/.test(h2), 'ได้ ' + tag(h2));

  // ⚠️ ตัวเลขในชื่อรุ่นห้ามถูกอ่านเป็นจำนวนสั่งซื้อ (เก็บเงินเกิน)
  const h3 = flavorHint('มาโบ9k เอาเบอร์รี่ชมพู', stockmap, 1);
  t(233, '"มาโบ9k เอาเบอร์รี่ชมพู" ห้ามอ่าน 9 เป็นจำนวน', tag(h3) === 'ถามจำนวน', 'ได้ ' + tag(h3) + ' = ออกการ์ด 9 ชิ้นทั้งที่ไม่ได้สั่ง');
  const h4 = flavorHint('STAR 2,500 แตงโม', stockmap, 1);
  t(234, '"STAR 2,500 แตงโม" ห้ามอ่าน 2,500 เป็นจำนวน', tag(h4) === 'ถามจำนวน', 'ได้ ' + tag(h4));

  // ⚠️ กำกวมต้องถามต่อ (ห้ามเดา — เงินลูกค้าไหลผ่านจริง)
  const h5 = flavorHint('เอามาโบ องุ่น', stockmap, 1);
  t(235, '"องุ่น" ลอยๆ ตรงหลายกลิ่น → ต้องลิสต์ให้เลือก ห้ามเดา', tag(h5) === 'ลิสต์กลิ่น', 'เดากลิ่นเอง: ' + lock(h5));
  const h6 = flavorHint('มาโบ9k มีกลิ่นไรบ้าง', stockmap, 1);
  t(236, 'ถามเฉยๆ ไม่ได้บอกกลิ่น → ลิสต์กลิ่นตามเดิม', tag(h6) === 'ลิสต์กลิ่น', 'ได้ ' + tag(h6));

  // ⚠️ บทเรียน k146: ด่านต้องไม่พาไปออกการ์ดของที่หมด
  const smOut = {}; for (const k in stockmap) smOut[k] = stockmap[k];
  smOut['MARBO 9K - องุ่นว่านหางจระเข้'] = 0;
  const h7 = flavorHint('เอามาโบ องุ่นว่าน 3 แท่ง', smOut, 1);
  t(237, 'กลิ่นที่ล็อกได้แต่ของหมด → ห้ามออกการ์ด ต้องบอกหมด', tag(h7) === 'บอกหมด', 'ได้ ' + tag(h7));

  for (const x of T) {
    if (x.ok) { pass++; console.log(`${GRN}✅ ${x.n}${RESET} ${DIM}[ฟังลูกค้า]${RESET} ${x.name}`); }
    else { fails.push({ n: String(x.n), c: { ask: x.name }, why: [x.why], out: '' }); console.log(`${RED}❌ ${x.n}${RESET} ${DIM}[ฟังลูกค้า]${RESET} ${x.name}\n      ${RED}↓${RESET} ${x.why}`); }
  }
}

// ═══ k153: จีทูต้องรู้ว่าตอนนี้กี่โมง — ห้ามรับปากว่า "ยังทันรอบวันนี้" ตอนเลยรอบไปแล้ว ═══
//   เคสจริง 3/8 23.14 (ลูกค้า B🦋A · ยืนยันด้วยแคปหน้าจอ LINE ว่าส่งถึงลูกค้าจริง):
//   "หลัง 20.45 รอบส่งออก 10.30 วันถัดไปค่ะ **ตอนนี้ยังพอมีเวลาเหลืออยู่**" = ขัดกันเองในข้อความเดียว
{
  const T = [];
  // เวลาไทย = UTC+7 → Date.UTC(...,16,14) = 23.14 น. เวลาไทย
  const at = (h, m) => Date.UTC(2026, 7, 3, h - 7, m);
  const t = (n, name, ok, why) => T.push({ n, name, ok, why: ok ? '' : why });

  t(206, 'เวลา 23.14 (เคสจริง) = เลยรอบส่งด่วนแล้ว', thTime(at(23, 14)).afterLast === true, 'ไม่รู้ว่าเลยรอบ');
  t(207, 'เวลา 14.00 กลางวัน = ยังอยู่ในรอบ', thTime(at(14, 0)).afterLast === false, 'ดันคิดว่าเลยรอบ');
  t(208, 'ขอบรอบ 20.45 พอดี = ยังทัน', thTime(at(20, 45)).afterLast === false, 'ตัดเร็วไป 1 นาที');
  t(209, 'ขอบรอบ 20.46 = เลยรอบแล้ว', thTime(at(20, 46)).afterLast === true, 'ปล่อยผ่านหลังปิดรอบ');
  t(210, 'ตี 3 (ร้านเปิดถึงตี 2-3) = เลยรอบแล้ว', thTime(at(3, 0)).afterLast === true, 'กลางดึกยังบอกว่าทัน');
  t(211, 'เวลาแสดงผลถูกต้อง 23.14', thTime(at(23, 14)).hhmm === '23.14', 'ได้ ' + thTime(at(23, 14)).hhmm);

  // ── ด่านขาออก: ประโยคที่เคยหลุดถึงลูกค้าจริง ต้องโดนตัด ──
  const real = 'หลัง 20.45 น. รอบส่งด่วนจะออกเป็นรอบ 10.30 น. ของวันถัดไปค่ะ 🙏🏻\nตอนนี้ยังพอมีเวลาเหลืออยู่ รบกวนรอทีมงานแจ้งค่าส่งด่วนก่อนนะคะ 🛵💕';
  const g1 = latePromiseGate(real, at(23, 14));
  t(212, 'เคสจริง 23.14: ตัด "ตอนนี้ยังพอมีเวลาเหลืออยู่" ออก', g1.blocked && !/ยังพอมีเวลา/.test(g1.reply), 'ยังหลุดถึงลูกค้า');
  t(213, 'เคสจริง 23.14: ยังคงประโยคที่ถูก (รอบ 10.30 วันถัดไป) ไว้', /10\.30/.test(g1.reply), 'ตัดประโยคที่ถูกทิ้งด้วย');
  t(214, 'เคสจริง 23.14: บอกเวลาจริงให้ลูกค้ารู้', /23\.14/.test(g1.reply), 'ไม่บอกว่าตอนนี้กี่โมง');

  const g2 = latePromiseGate('ใช่ค่ะ ถ้าชำระเงินและลงออเดอร์เรียบร้อยก่อน 20.45 น. รอบส่งด่วนจะออกภายในวันนี้ และได้รับภายใน 1-3 ชม. ค่ะ 🛵', at(23, 13));
  t(215, 'เคสจริง 23.13: ตัดประโยคเงื่อนไข "ก่อน 20.45 น. จะออกภายในวันนี้"', g2.blocked && !/ก่อน\s*20\.45/.test(g2.reply), 'ยังรับปากว่าทันวันนี้');
  t(216, 'เคสจริง 23.13: เหลือแต่ข้อความจริง ไม่เหลือเศษประโยคขาดหัว', !/^\s*(และ|แต่|ค่ะ)/.test(g2.reply), 'เหลือเศษประโยค: ' + g2.reply.slice(0, 30));

  const g3 = latePromiseGate('ขออภัยที่ทำให้ผิดหวังนะคะ 🙏🏻 แต่ถ้าชำระเงินและลงออเดอร์เรียบร้อยก่อน 20.45 น. ยังทันรอบส่งด่วนวันนี้ค่ะ', at(23, 14));
  t(217, 'เคสจริง "อ้าวนึกว่าจะได้คืนนี้" → ห้ามยืนยันซ้ำว่ายังทัน', g3.blocked && !/ยังทัน/.test(g3.reply), 'ยังยืนยันผิดซ้ำ');

  // ── ห้ามด่านทำงานผิดเวลา (บทเรียน k146: ด่านกันมั่วกลายเป็นตัวสร้างความมั่วเอง) ──
  const day = 'ถ้าชำระเงินก่อน 20.45 น. มีโอกาสได้รับภายในวันนี้ค่ะ 🛵';
  t(218, 'กลางวัน 14.00: ห้ามแตะข้อความที่ถูกอยู่แล้ว', latePromiseGate(day, at(14, 0)).blocked === false && latePromiseGate(day, at(14, 0)).reply === day, 'ด่านทำงานผิดเวลา');
  const other = 'MARBO 9K (350 บาท) มีกลิ่นองุ่นพร้อมส่งค่ะ 💕 รับกี่ชิ้นดีคะ';
  t(219, 'ดึก 23.14: ข้อความที่ไม่เกี่ยวกับเวลา ห้ามโดนแตะ', latePromiseGate(other, at(23, 14)).reply === other, 'ไปตัดข้อความสินค้าทิ้ง');
  t(220, 'ดึก 23.14: ประโยคอธิบายกฎที่ถูก ("หลัง 20.45...") ต้องผ่านได้', /หลัง 20\.45/.test(g1.reply), 'ตัดประโยคอธิบายกฎที่ถูกทิ้ง');

  // ── หมายเหตุต่อท้ายทางลัดส่งด่วน (ก้อน exp.pending / exp.fee ที่เดิมไม่เช็คเวลาเลย) ──
  t(221, 'lateNote ตอนดึก: บอกรอบถัดไป 10.30 น.', /10\.30/.test(lateNote(at(23, 14))), 'ไม่บอกรอบถัดไป');
  t(222, 'lateNote กลางวัน: ต้องเงียบ (ไม่รบกวนลูกค้า)', lateNote(at(14, 0)) === '', 'โผล่ตอนกลางวัน');

  for (const x of T) {
    if (x.ok) { pass++; console.log(`${GRN}✅ ${x.n}${RESET} ${DIM}[เวลา]${RESET} ${x.name}`); }
    else { fails.push({ n: String(x.n), c: { ask: x.name }, why: [x.why], out: '' }); console.log(`${RED}❌ ${x.n}${RESET} ${DIM}[เวลา]${RESET} ${x.name}\n      ${RED}↓${RESET} ${x.why}`); }
  }
}

// ═══ ทดสอบ "แยกความแรงนิโคติน" (k43) — จำลองคีย์สต็อกจริงของร้าน ═══
function strengthTests() {
  const T = [];
  // ร้านเขียนคีย์ 2 แบบ: ความแรงอยู่ที่รุ่น (RELX/MARBO ZERO) และอยู่ที่กลิ่น (ABC LEGO)
  const sm = {
    'MARBO ZERO - องุ่น': 40, 'MARBO ZERO 5% - องุ่น': 7,
    'RELX BOOST POD - แตงโม': 0, 'RELX BOOST POD 5% - แตงโม': 25,
    'RELX ULTRA 3% - ดับเบิ้ลมิ้นต์': 12, 'RELX ULTRA 5% - ดับเบิ้ลมิ้นต์': 3,
    'ABC LEGO - องุ่น 3%': 9, 'ABC LEGO - องุ่น 5%': 60,
  };
  const chk = (n, name, model, flavor, want) => {
    let got; try { got = findStockForItem(sm, model, flavor); } catch (e) { got = 'ERR ' + e; }
    T.push({ n, name, ok: got === want, why: got === want ? '' : `ได้ ${got} ควรได้ ${want}` });
  };
  chk(37, 'MARBO ZERO องุ่น 3% → ไม่ใช่ของ 5%', 'หัวพอต MARBO ZERO', 'องุ่น 3%', 40);
  chk(38, 'MARBO ZERO องุ่น 5% → ต้องได้ 5%', 'หัวพอต MARBO ZERO', 'องุ่น 5%', 7);
  chk(39, 'BOOST POD แตงโม 3% หมด (5% ยังมี)', 'RELX BOOST POD', 'แตงโม 3%', 0);
  chk(40, 'BOOST POD แตงโม 5% ยังมีของ', 'RELX BOOST POD', 'แตงโม 5%', 25);
  chk(41, 'ULTRA ดับเบิ้ลมิ้นต์ 3%', 'หัวพอต RELX ULTRA', 'ดับเบิ้ลมิ้นต์ 3%', 12);
  chk(42, 'ULTRA ดับเบิ้ลมิ้นต์ 5%', 'หัวพอต RELX ULTRA', 'ดับเบิ้ลมิ้นต์ 5%', 3);
  chk(43, 'ABC LEGO (ความแรงอยู่ที่ชื่อกลิ่น) 3%', 'ABC LEGO 20K', 'องุ่น 3%', 9);
  chk(44, 'ABC LEGO (ความแรงอยู่ที่ชื่อกลิ่น) 5%', 'ABC LEGO 20K', 'องุ่น 5%', 60);

  // ห้ามมีกลิ่นชื่อซ้ำในรุ่นเดียวกันอีก (ไม่งั้นเมนูจะวาดตกอีก)
  const dup = [];
  for (const k in FLAVORS) { const f = FLAVORS[k].f || []; if (new Set(f).size !== f.length) dup.push(k); }
  T.push({ n: 45, name: 'ไม่มีกลิ่นชื่อซ้ำในรุ่นเดียวกัน', ok: !dup.length, why: dup.length ? 'ยังซ้ำ: ' + dup.join(', ') : '' });

  // จำนวนสินค้าต้องครบตามที่นับไว้
  let flav = 0, noF = 0;
  for (const k in FLAVORS) { const n = (FLAVORS[k].f || []).length; if (n) flav += n; else noF++; }
  T.push({ n: 46, name: `สินค้าครบ 65 รุ่น · 913 กลิ่น · 918 SKU`, ok: Object.keys(FLAVORS).length === 65 && flav === 913 && flav + noF === 918, why: `ได้ ${Object.keys(FLAVORS).length} รุ่น / ${flav} กลิ่น / ${flav + noF} SKU` });
  return T;
}

for (const t of strengthTests()) {
  if (t.ok) { pass++; console.log(`${GRN}✅ ${t.n}${RESET} ${DIM}[ความแรง]${RESET} ${t.name}`); }
  else { fails.push({ n: String(t.n), c: { ask: t.name }, why: [t.why], out: '' }); console.log(`${RED}❌ ${t.n}${RESET} ${DIM}[ความแรง]${RESET} ${t.name}\n      ${RED}\u2193${RESET} ${t.why}`); }
}

// k153: เดิมนับมือ (CASES.length + ตัวเลขคงที่) แล้วลืมอัปเดตทุกครั้งที่เพิ่มเทส
//   → ขึ้น "ผ่าน 204/110" คือตัวหารน้อยกว่าตัวผ่าน อ่านแล้วนึกว่าเทสพัง
//   นับจากของจริงแทน: ผ่าน + ไม่ผ่าน = จำนวนเทสทั้งหมดเสมอ ไม่ต้องแก้มืออีก
const TOTAL = pass + fails.length;

console.log('\n' + '═'.repeat(60));
console.log(`ผ่าน ${pass}/${TOTAL}` + (fails.length ? `  ${RED}ไม่ผ่าน ${fails.length} ข้อ${RESET}` : `  ${GRN}ครบทุกข้อ 🎉${RESET}`));
if (fails.length) {
  console.log(`\n${YEL}── คำตอบจริงของข้อที่พัง ──${RESET}`);
  for (const f of fails) console.log(`\n[${f.n}] ${f.c.ask}\n${DIM}${f.out.slice(0, 400)}${RESET}`);
  console.log(`\n${RED}⛔ ห้ามอัพขึ้น GitHub จนกว่าจะเขียว${RESET}`);
  process.exit(1);
}
console.log(`${GRN}✔ ปลอดภัย อัพได้${RESET}`);
