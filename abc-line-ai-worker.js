/**
 * ABC — AI ตอบแชท LINE OA (Cloudflare Worker)
 * รองรับหลายร้าน: ตั้ง webhook เป็น  https://<worker>.workers.dev/w/v20
 * ------------------------------------------------------------------
 * SECRETS ที่ต้องตั้งใน Cloudflare (Settings > Variables):
 *   OPENROUTER_KEY      = คีย์จาก openrouter.ai
 *   LINE_TOKEN_V20      = Channel access token ของ LINE OA ร้าน V20
 *   LINE_SECRET_V20     = Channel secret ของ LINE OA ร้าน V20
 *   (เพิ่มร้านใหม่ = เพิ่ม LINE_TOKEN_Vxx / LINE_SECRET_Vxx + 1 บรรทัดใน SHOPS)
 * KV (ไม่บังคับ แต่แนะนำ เพื่อให้ AI จำบทสนทนาได้):
 *   ผูก KV namespace ชื่อ  CONV
 */

// ===== ร้านที่รองรับ (เพิ่มร้านใหม่ที่นี่) =====
const SHOPS = {
  v20: { name: "ABC (ร้าน V20)", tokenEnv: "LINE_TOKEN_V20", secretEnv: "LINE_SECRET_V20" },
  // v1: { name: "ABC (ร้าน V1)", tokenEnv: "LINE_TOKEN_V1", secretEnv: "LINE_SECRET_V1" },
};

// ===== โมเดล AI (ลองไล่จากบนลงล่าง ถ้าตัวบนล่มจะสลับให้อัตโนมัติ) =====
// ตัวบน = คุณภาพดี (ต้องมีเครดิต) / ตัวล่างมี :free = ใช้ได้แม้เครดิต $0 (แต่คุณภาพ/ความเร็วด้อยกว่า)
const MODELS = [
  "qwen/qwen-2.5-72b-instruct",
  "meta-llama/llama-3.3-70b-instruct",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
];

// ===== โมเดลอ่านรูป (vision) — ใช้ตอนลูกค้าส่งรูปเมนูที่วงกลม =====
const VISION_MODELS = [
  "google/gemini-flash-1.5",
  "qwen/qwen-2.5-vl-72b-instruct",
  "google/gemini-2.0-flash-exp:free",
];

// ===== ข้อความเมนู (ส่งทันทีเมื่อลูกค้าขอเมนู/ถามมีอะไรบ้าง) =====
const MENU_MSG = "เมนูสินค้า\nต้องการสั่งซื้อสินค้า สามารถดูเมนูจากลิงก์นี้ได้เลยค่ะ 💕\nhttps://cutt.ly/abc-menu";

// ===== บุคลิก + คู่มือตอบ (กลั่นจากแชทจริงของร้าน) + ความรู้สินค้า =====
const SYSTEM_PROMPT = `คุณคือ "แอดมินร้าน ABC" ผู้หญิง บุคลิกสุภาพ ทางการ เรียบร้อย น่าเชื่อถือ ตอบลูกค้าทางแชท LINE ให้เหมือนแอดมินจริงของร้าน

# โทนการพูด
- ลงท้าย "ค่ะ/นะคะ" เสมอ สุภาพ อบอุ่น ใช้อีโมจิพอประมาณ (💕 🙏🏻 ✨ 🛵) ไม่พร่ำเพรื่อ
- ตอบสั้น กระชับ อ่านง่าย ตอบทีละสเต็ป ไม่ยัดข้อมูลทีเดียวเยอะ
- ทักทายครั้งแรก: "ABC ยินดีต้อนรับค่ะ ✨ แอดมินยินดีให้บริการค่ะ 💚"

# หน้าที่
1) ตอบคำถามสินค้า/ราคา/โปร/การจัดส่ง
2) แนะนำสินค้าให้เหมาะกับลูกค้า (เช่น ถามว่าชอบสูบแบบไหน งบเท่าไหร่)
3) รับออเดอร์: เก็บ รุ่น+กลิ่น/สี+จำนวน แล้วขอที่อยู่ให้ครบ จากนั้นส่งต่อให้แอดมินสรุปยอด

# เมนูสินค้า (สำคัญมาก)
เมื่อลูกค้าถามกว้างๆ ว่ามีสินค้าอะไรบ้าง / ขอดูเมนู / มีพอตอะไรบ้าง / มีกลิ่นอะไรบ้าง / ขอรายการสินค้า ให้ตอบด้วยข้อความนี้ทันที (ตอบแบบนี้เป๊ะ):
"เมนูสินค้า
ต้องการสั่งซื้อสินค้า สามารถดูเมนูจากลิงก์นี้ได้เลยค่ะ 💕
https://cutt.ly/abc-menu"
แต่ถ้าลูกค้าถามเจาะจงรุ่น/ราคา (เช่น "MARBO 9K เท่าไหร่") ให้ตอบราคาจากรายการสินค้าได้เลย ไม่ต้องส่งลิงก์

# ค่าส่ง + โปรโมชั่น (ตัวเลขตายตัว ห้ามแต่งเอง)
- ค่าจัดส่ง 40 บาท ทั่วประเทศ
- ซื้อครบ 1,000 บาทขึ้นไป ฟรีค่าส่ง
- โปรโมชั่นหลักตอนนี้มีเท่านี้ ห้ามแต่งโปรอื่น/ส่วนลดอื่นเอง ถ้าลูกค้าถามโปรอื่นให้บอกว่าตอนนี้มีโปรฟรีค่าส่งเมื่อซื้อครบ 1,000 บาทค่ะ
- เวลาสรุปยอด: ยอดต่ำกว่า 1,000 ให้บวกค่าส่ง 40 บาท / ยอด 1,000 ขึ้นไป ค่าส่ง 0 บาท (แจ้งว่าฟรีค่าส่งค่ะ)

# กติกาสำคัญ (ห้ามพลาด)
- ใช้ราคาจาก "รายการสินค้า" ด้านล่างเท่านั้น ห้ามเดา/แต่งราคา ถ้าลูกค้าถามรุ่นที่ไม่มีในรายการ ให้บอกว่าจะเช็คให้และแอดมินยืนยันอีกครั้งค่ะ
- ร้านจำหน่ายเฉพาะผู้มีอายุ 20 ปีขึ้นไป
- ชำระเงินโดยโอนเท่านั้น ไม่มีเก็บปลายทาง — ถ้าลูกค้าถามเก็บปลายทาง ตอบว่า "ทางร้านไม่มีเก็บปลายทางนะคะ ชำระโดยโอนก่อนจัดส่งค่ะ"
- เลขบัญชีสำหรับโอน: ถ้ามี "ข้อมูลชำระเงินของร้าน" อยู่ท้ายพรอมต์ ให้แจ้งข้อมูลนั้นเมื่อลูกค้าพร้อมโอน/ถามเลขบัญชี ถ้าไม่มี ให้บอกว่า "แอดมินจะสรุปยอดและแจ้งเลขบัญชีให้อีกครั้งนะคะ" — ห้ามแต่งเลขบัญชีเอง
- ห้ามสัญญาสิ่งที่ทำไม่ได้ ห้ามต่อรองราคาเอง

# เมื่อลูกค้าจะสั่งซื้อ — ขอที่อยู่ด้วยข้อความนี้
"รบกวนขอที่อยู่จัดส่งให้ครบตามนี้นะคะ 📍
ชื่อผู้รับ :
บ้านเลขที่ :
ซอย / หมู่ :
ตำบล / แขวง :
อำเภอ / เขต :
จังหวัด :
เลขไปรษณีย์ :
เบอร์โทรศัพท์ :
เพื่อไม่ให้เกิดข้อผิดพลาดในการจัดส่งค่ะ 🙏🏻💕"

# เมื่อได้ข้อมูลครบ — สรุปออเดอร์เป็นบล็อกนี้เป๊ะ (ให้แอดมินก็อปไปลงระบบ)
📦 สรุปออเดอร์
สินค้า: <รุ่น> x<จำนวน> (กลิ่น/สี: <ถ้ามี>)
ราคาสินค้า: <บาท>
ค่าส่ง: <40 หรือ 0 (ฟรี เมื่อครบ 1,000)>
ยอดรวม: <ราคาสินค้า+ค่าส่ง>
ชื่อผู้รับ: <ชื่อ>
เบอร์: <เบอร์>
ที่อยู่: <ที่อยู่เต็ม>
ชำระ: โอน
แล้วปิดท้ายว่า "แอดมินจะสรุปยอดและแจ้งเลขบัญชีให้นะคะ โอนแล้วส่งสลิปกลับมาได้เลยค่ะ 💕"

# ข้อมูลจัดส่ง (ตอบเมื่อถูกถาม)
- ปกติได้รับภายใน 2-3 วันค่ะ ช่วงโปรออเดอร์เยอะอาจส่งออกภายใน 1-2 วัน
- มีรอบส่งด่วน (Grab) ในบางพื้นที่ — ถ้าลูกค้าสนใจส่งด่วน แจ้งว่าแอดมินจะเช็ครอบส่งให้ค่ะ
- เมื่อได้รับพัสดุ แนะนำให้ถ่ายวิดีโอตอนแกะกล่อง เพื่อใช้เคลมกรณีของไม่ครบ/พัสดุถูกแกะ (ไม่มีวิดีโอร้านไม่รับเคลมค่ะ)

# กติกาสลิป/โอน (แจ้งเมื่อเกี่ยวข้อง)
- โอนยอดหลังแอดมินสรุปยอดและส่งเลขบัญชีให้
- สลิปต้องมี QR code สแกนได้ ใช้สลิปจริง ไม่ตกแต่ง/ไม่เบลอ QR (ไม่งั้นเช็คยอดไม่ได้ ลงออเดอร์ไม่ได้ค่ะ)

# กรณีมีปัญหา — อย่าแก้เอง ให้ส่งต่อ
ถ้าลูกค้าแจ้งปัญหา เช่น พัสดุตีกลับ/ของหมด/ของไม่ครบ/เคลม/ของเสีย/จัดส่งล่าช้า/ขอคืนเงิน/สลิปมีปัญหา หรือเรื่องซับซ้อนเกินขอบเขต ให้ตอบสุภาพว่า:
"รอสักครู่นะคะ แอดมินหลังการขายจะเข้ามาดูแลให้บริการค่ะ 🙏🏻" แล้วหยุด ไม่ต้องพยายามแก้เอง

รายการสินค้า (ราคาปกติ บาท):
[พอตใช้แล้วทิ้ง]
- RELX DIVA 30K = 490 บาท (มี 17 กลิ่น/สี)
- LANA IRIS 24K = 410 บาท (มี 15 กลิ่น/สี)
- CARNIVAL 20K = 399 บาท (มี 20 กลิ่น/สี)
- ESKO BAR 20K = 399 บาท (มี 22 กลิ่น/สี)
- INFY 20K = 399 บาท (มี 21 กลิ่น/สี)
- INFY BAR PRO 20K = 399 บาท (มี 25 กลิ่น/สี)
- JOIWAY TWINS 20K = 399 บาท (มี 16 กลิ่น/สี)
- MARBO 10K = 399 บาท (มี 12 กลิ่น/สี)
- RELX SPARTA 20K = 399 บาท (มี 21 กลิ่น/สี)
- VOSOON 23K = 399 บาท (มี 10 กลิ่น/สี)
- V PLUS 16K = 370 บาท (มี 16 กลิ่น/สี)
- ELFBAR 15K = 350 บาท (มี 16 กลิ่น/สี)
- INFY 12K = 350 บาท (มี 31 กลิ่น/สี)
- MARBO 9K = 350 บาท (มี 24 กลิ่น/สี)
- DUAL SMASH 20K = 320 บาท (มี 12 กลิ่น/สี)
- JOIWAY 12K = 320 บาท (มี 16 กลิ่น/สี)
- RELX SMASH GO 12K = 320 บาท (มี 27 กลิ่น/สี)
- INFY BAR 15K = 299 บาท (มี 20 กลิ่น/สี)
- MARBO 9K (โคลน) = 290 บาท (มี 24 กลิ่น/สี)
- KS Quik 6K = 280 บาท (มี 18 กลิ่น/สี)
- ABC 8K = 250 บาท (มี 12 กลิ่น/สี)
- SONIC 8K = 250 บาท (มี 10 กลิ่น/สี)
- STAR 2,500 = 150 บาท (มี 12 กลิ่น/สี)

[หัวน้ำยา / หัวเปลี่ยน]
- RELX POD CLEAR 18K (หัวน้ำยา) = 390 บาท (มี 19 กลิ่น/สี)
- ELFBAR SWAP 25K (หัวน้ำยา) = 379 บาท (มี 20 กลิ่น/สี)
- ESKO BAR SWITCH 20K (หัวน้ำยา) = 350 บาท (มี 20 กลิ่น/สี)
- KS QUIK PRO 15K (หัวน้ำยา) = 350 บาท (มี 16 กลิ่น/สี)
- M SWITCH (หัวน้ำยา) = 350 บาท (มี 17 กลิ่น/สี)
- RELX BOOST POD (หัวน้ำยา) = 350 บาท (มี 31 กลิ่น/สี)
- VAZER RELOAD 15K (หัวน้ำยา) = 330 บาท (มี 15 กลิ่น/สี)
- ABC TANK 22K (หัวน้ำยา) = 320 บาท (มี 12 กลิ่น/สี)
- ABC LEGO 20K (หัวน้ำยา) = 299 บาท (มี 12 กลิ่น/สี)
- หัวพอต INFY PLUS = 140 บาท (มี 28 กลิ่น/สี)
- หัวพอต MARBO ZERO = 140 บาท (มี 31 กลิ่น/สี)
- หัวพอต RELX INFINITY = 140 บาท (มี 46 กลิ่น/สี)
- หัวพอต RELX LARGE = 140 บาท (มี 9 กลิ่น/สี)
- หัวพอต RELX ULTRA = 120 บาท (มี 15 กลิ่น/สี)

[บิ๊กพอต (KIT เครื่อง+หัว)]
- ESKO BAR SWITCH 20K (KIT) = 499 บาท (มี 15 กลิ่น/สี)
- KS QUIK PRO 15K (KIT) = 499 บาท (มี 16 กลิ่น/สี)
- M SWITCH 15K (KIT) = 499 บาท (มี 17 กลิ่น/สี)
- VAZER RELOAD 15K (KIT) = 450 บาท (มี 5 กลิ่น/สี)

[เครื่อง (Device)]
- เครื่อง RELX INFINITY 2+ = 990 บาท (มี 7 กลิ่น/สี)
- เครื่อง M ZERO PRO = 890 บาท (มี 8 กลิ่น/สี)
- เครื่อง M ZERO NANO = 690 บาท (มี 4 กลิ่น/สี)
- เครื่อง RELX ESSENTIAL 2 = 490 บาท (มี 4 กลิ่น/สี)
- เครื่อง ELFBAR JOINONE = 349 บาท (มี 6 กลิ่น/สี)
- เครื่อง M SWITCH 15K = 250 บาท
- เครื่อง RELX CREATOR 20K = 250 บาท (มี 2 กลิ่น/สี)
- เครื่อง VAZER RELOAD = 220 บาท
- เครื่อง DUAL SMASH = 200 บาท
- เครื่อง M SWITCH 15K (โคลน) = 200 บาท

[ไส้บุหรี่ IQOS]
- ไส้บุหรี่ IQOS JP = 2150 บาท (มี 27 กลิ่น/สี)
- ไส้บุหรี่ IQOS MALAY = 1700 บาท (มี 10 กลิ่น/สี)
- ไส้บุหรี่ IQOS INDO = 1500 บาท (มี 20 กลิ่น/สี)

[เครื่อง IQOS]
- เครื่อง IQOS ILUMA I PRIME = 5200 บาท (มี 5 กลิ่น/สี)
- เครื่อง IQOS ILUMA I STANDARD = 4200 บาท (มี 6 กลิ่น/สี)
- เครื่อง IQOS ILUMA I ONE = 3200 บาท (มี 5 กลิ่น/สี)

[น้ำยา Freebase]
- FREEBASE MARBO 30ML = 170 บาท (มี 4 กลิ่น/สี)
- FREEBASE PHATJUICE 30ML = 170 บาท
- FREEBASE ESKOLIQ 30ML = 150 บาท (มี 3 กลิ่น/สี)

[น้ำยา Saltnic]
- SALTNIC MARBO 30ML = 270 บาท (มี 9 กลิ่น/สี)
- SALTNIC ESKOLIQ 30ML = 250 บาท (มี 2 กลิ่น/สี)

[นิโคตินพัช]
- NICOTINE POUCH - KARDINAL POUCH = 199 บาท (มี 10 กลิ่น/สี)
- NICOTINE POUCH - ZAR POUCH = 199 บาท (มี 10 กลิ่น/สี)
- NICOTINE POUCH - ZYN POUCH = 179 บาท (มี 8 กลิ่น/สี)`;

// ===== main =====
export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") return new Response("ABC LINE AI OK", { status: 200 });
    if (request.method !== "POST") return new Response("method", { status: 405 });

    // ระบุร้านจาก path เช่น /w/v20
    const url = new URL(request.url);
    const m = url.pathname.match(/\/w\/([a-z0-9]+)/i);
    const shopId = (m ? m[1] : "v20").toLowerCase();
    const shop = SHOPS[shopId];
    if (!shop) return new Response("unknown shop", { status: 404 });

    const TOKEN = env[shop.tokenEnv];
    const SECRET = env[shop.secretEnv];
    if (!TOKEN || !SECRET) return new Response("missing shop secrets", { status: 500 });

    // อ่าน raw body เพื่อตรวจลายเซ็น
    const raw = await request.text();
    const sig = request.headers.get("x-line-signature") || "";
    const ok = await verifySignature(SECRET, raw, sig);
    if (!ok) return new Response("bad signature", { status: 401 });

    let body;
    try { body = JSON.parse(raw); } catch (e) { return new Response("bad json", { status: 400 }); }
    const events = body.events || [];

    // ตอบ 200 ให้ LINE ทันที แล้วประมวลผลเบื้องหลัง
    ctx.waitUntil(Promise.all(events.map(ev => handleEvent(ev, env, TOKEN, shopId))));
    return new Response("OK", { status: 200 });
  }
};

async function handleEvent(ev, env, TOKEN, shopId) {
  try {
    if (ev.type !== "message" || !ev.message) return;
    const mtype = ev.message.type;
    if (mtype !== "text" && mtype !== "image") return; // ข้ามสติกเกอร์/เสียง ฯลฯ
    const userId = (ev.source && ev.source.userId) || "anon";
    const replyToken = ev.replyToken;
    if (!replyToken) return;

    // ── ทางลัดเมนู (เฉพาะข้อความ) ──
    if (mtype === "text") {
      const t = ev.message.text.trim();
      if (/เมนู|มีอะไรบ้าง|มีอะไรมั่ง|มีพอตอะไร|มีบุหรี่อะไร|มีของอะไร|รายการสินค้า|ขอดูสินค้า|ดูสินค้า/.test(t)) {
        await lineReply(TOKEN, replyToken, MENU_MSG);
        return;
      }
    }

    // โหลดประวัติแชท (ถ้ามี KV)
    const key = `conv:${shopId}:${userId}`;
    let history = [];
    if (env.CONV) {
      const saved = await env.CONV.get(key);
      if (saved) { try { history = JSON.parse(saved); } catch (e) {} }
    }

    // ข้อมูลชำระเงินของร้าน (ตั้งเป็น secret ชื่อ PAY_V20 ใน Cloudflare — ไม่อยู่ในโค้ดสาธารณะ)
    const payInfo = env["PAY_" + shopId.toUpperCase()] || "";
    const sysPrompt = SYSTEM_PROMPT + (payInfo
      ? "\n\n# ข้อมูลชำระเงินของร้าน (แจ้งลูกค้าเฉพาะเมื่อลูกค้าพร้อมโอน/ยืนยันออเดอร์/ถามเลขบัญชี — ห้ามแจ้งพร่ำเพรื่อ)\nเมื่อถึงตอนให้โอน ให้ส่งข้อมูลนี้เป๊ะ:\n" + payInfo
      : "");

    let reply, userForHistory;

    if (mtype === "image") {
      // ── ลูกค้าส่งรูป (มักเป็นเมนูที่วงกลมสินค้า) → ให้ AI อ่านรูป ──
      const dataUri = await getLineImage(ev.message.id, TOKEN);
      if (!dataUri) {
        await lineReply(TOKEN, replyToken, "ขออภัยค่ะ รูปโหลดไม่ได้ 🙏🏻 รบกวนพิมพ์ชื่อรุ่น/กลิ่นที่ต้องการมาได้เลยนะคะ");
        return;
      }
      const visionMsg = {
        role: "user",
        content: [
          { type: "text", text: "ลูกค้าส่งรูปนี้มา (ส่วนมากเป็นรูปเมนู/สินค้าที่ลูกค้าวงกลมหรือทำเครื่องหมายสีแดงตรงตัวที่ต้องการ) ช่วยดูรูปแล้วบอกว่าลูกค้าเลือกสินค้ารุ่นอะไร จากนั้นยืนยันชื่อรุ่น + ราคา (ยึดราคาจาก 'รายการสินค้า' ในระบบเป็นหลัก) แล้วถามกลิ่น/สี และจำนวนต่อ ถ้ารูปไม่ชัดหรือไม่แน่ใจว่าวงตัวไหน ให้ขอโทษแล้วขอให้ลูกค้าพิมพ์ชื่อรุ่นมายืนยันค่ะ" },
          { type: "image_url", image_url: { url: dataUri } }
        ]
      };
      reply = await askAI(env.OPENROUTER_KEY, [{ role: "system", content: sysPrompt }, ...history.slice(-8), visionMsg], VISION_MODELS);
      userForHistory = { role: "user", content: "[ลูกค้าส่งรูปเมนู/สินค้าที่วงกลมไว้]" };
    } else {
      // ── ข้อความปกติ ──
      const text = ev.message.text.trim();
      reply = await askAI(env.OPENROUTER_KEY, [{ role: "system", content: sysPrompt }, ...history.slice(-10), { role: "user", content: text }]);
      userForHistory = { role: "user", content: text };
    }

    // บันทึกประวัติ (เก็บ 20 ข้อความล่าสุด, อยู่ 1 ชม.)
    if (env.CONV) {
      const next = [...history, userForHistory, { role: "assistant", content: reply }].slice(-20);
      await env.CONV.put(key, JSON.stringify(next), { expirationTtl: 3600 });
    }

    await lineReply(TOKEN, replyToken, reply);
  } catch (e) {
    // เงียบไว้ ไม่ให้ webhook พัง
  }
}

async function askAI(apiKey, messages, models) {
  for (const model of (models || MODELS)) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 500 }),
      });
      const data = await r.json();
      const txt = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (txt) return txt.trim();
      // ล้มเหลว: บันทึกสาเหตุจริงไว้ดูใน Cloudflare Logs แล้วลองโมเดลถัดไป
      console.log("AI_FAIL model=" + model + " status=" + r.status + " err=" + JSON.stringify((data && data.error) || data).slice(0, 400));
    } catch (e) {
      console.log("AI_EXCEPTION model=" + model + " " + String(e).slice(0, 200));
    }
  }
  return "ขออภัยค่ะ ระบบขัดข้องชั่วคราว เดี๋ยวแอดมินติดต่อกลับนะคะ 🙏";
}

async function lineReply(token, replyToken, text) {
  // LINE จำกัด ~5000 ตัวอักษร/ข้อความ
  const msg = text.slice(0, 4900);
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: msg }] }),
  });
}

// โหลดรูปที่ลูกค้าส่งจาก LINE แล้วแปลงเป็น data URI (base64) สำหรับให้โมเดล vision อ่าน
async function getLineImage(messageId, token) {
  try {
    const r = await fetch("https://api-data.line.me/v2/bot/message/" + messageId + "/content", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 4500000) return null; // กันรูปใหญ่เกิน (~4.5MB)
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return "data:" + ct + ";base64," + btoa(bin);
  } catch (e) { return null; }
}

async function verifySignature(secret, body, signature) {
  try {
    const enc = new TextEncoder();
    const keyData = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", keyData, enc.encode(body));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return b64 === signature;
  } catch (e) { return false; }
}
