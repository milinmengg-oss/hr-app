/**
 * ABC — AI ตอบแชท LINE OA (Cloudflare Worker)
 * รองรับหลายร้าน: ตั้ง webhook เป็น  https://<worker>.workers.dev/w/v20
 * ------------------------------------------------------------------
 * SECRETS ที่ต้องตั้งใน Cloudflare (Settings > Variables):
 *   OPENROUTER_KEY      = คีย์จาก openrouter.ai
 *   LINE_TOKEN_V20      = Channel access token ของ LINE OA ร้าน V20
 *   LINE_SECRET_V20     = Channel secret ของ LINE OA ร้าน V20
 *   (เพิ่มร้านใหม่ = เพิ่ม LINE_TOKEN_Vxx / LINE_SECRET_Vxx + 1 บรรทัดใน SHOPS)
 *   SLIPOK_KEY / SLIPOK_BRANCH = ตรวจสลิปอัตโนมัติกับ SlipOK (ไม่บังคับ — ถ้าไม่ตั้ง จีทูจะแค่รับสลิปเฉยๆ)
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
// 🔖 เวอร์ชันโค้ด — เช็คได้ที่ /version ว่า Cloudflare รันตัวนี้อยู่จริงมั้ย
const BUILD = "2026-07-27-f2-iqos";

const MODELS = [
  "deepseek/deepseek-chat",              // หลัก: V3 — เชื่อฟังกฎแม่น นิ่งกว่า (เทส V3.2 แล้วตอบมึน เลยกลับมาใช้ตัวนี้)
  "qwen/qwen-2.5-72b-instruct",
  "meta-llama/llama-3.3-70b-instruct",   // (ตัว :free ถูกปิดแล้ว → ใช้ตัวปกติ)
  "google/gemini-2.5-flash",             // สำรองสุดท้าย เร็วและเสถียร
];

// ===== โมเดลอ่านรูป (vision) — ใช้ตอนลูกค้าส่งรูปเมนูที่วงกลม =====
const VISION_MODELS = [
  "google/gemini-2.5-flash",          // อ่านรูปเมนูวงแดง/ตัวหนังสือไทยแม่นสุด
  "google/gemini-flash-1.5",
  "qwen/qwen-2.5-vl-72b-instruct",
  "google/gemini-2.0-flash-exp:free",
];

// ===== ข้อความเมนู (ส่งทันทีเมื่อลูกค้าขอเมนู/ถามมีอะไรบ้าง) =====
const NM2ID = {"ABC LEGO - ดับเบิ้ลมิ้นต์ 3%":1,"ABC LEGO - น้ำแร่ 3%":1,"ABC LEGO - มิกซ์เบอร์รี่ 3%":1,"ABC LEGO - องุ่น 3%":1,"ABC LEGO - โคล่า 3%":1,"ABC LEGO - ชามะลิ 3%":1,"ABC LEGO - สับปะรด 3%":1,"ABC LEGO - แตงโม 3%":1,"ABC LEGO - ดับเบิ้ลมิ้นต์ 5%":1,"ABC LEGO - มิกซ์เบอร์รี่ 5%":1,"ABC LEGO - องุ่น 5%":1,"ABC LEGO - แตงโม 5%":1,"ABC TANK - ดับเบิ้ลมิ้นต์ 3%":2,"ABC TANK - บลูเบอร์รี่เย็น 3%":2,"ABC TANK - พีชสตรอว์เบอร์รี่ 3%":2,"ABC TANK - มิกซ์เบอร์รี่ 3%":2,"ABC TANK - แตงโม 3%":2,"ABC TANK - องุ่น 3%":2,"ABC TANK - องุ่นลิ้นจี่ 3%":2,"ABC TANK - โคล่า 3%":2,"ABC TANK - ดับเบิ้ลมิ้นต์ 5%":2,"ABC TANK - แตงโม 5%":2,"ABC TANK - องุ่น 5%":2,"ABC TANK - โคล่า 5%":2,"ABC 8K - กล้วย":15,"ABC 8K - ดับเบิ้ลมิ้นต์":15,"ABC 8K - แตงโม":15,"ABC 8K - น้ำแร่":15,"ABC 8K - บลูไอซ์":15,"ABC 8K - มิกซ์เบอร์รี่":15,"ABC 8K - ลิ้นจี่":15,"ABC 8K - โคล่า":15,"ABC 8K - สตรอว์เบอร์รี่":15,"ABC 8K - สับปะรด":15,"ABC 8K - องุ่น":15,"ABC 8K - องุ่นอโล":15,"CARNIVAL 20K - กัมมี่":16,"CARNIVAL 20K - โคล่า":16,"CARNIVAL 20K - ดับเบิ้ลมิ้นต์":16,"CARNIVAL 20K - แตงโมไอซ์":16,"CARNIVAL 20K - บลูเบอร์รี่":16,"CARNIVAL 20K - พีชสตรอว์เบอร์รี่":16,"CARNIVAL 20K - สตรอว์เบอร์รี่":16,"CARNIVAL 20K - ส้มโซดา":16,"CARNIVAL 20K - องุ่น":16,"CARNIVAL 20K - องุ่นลิ้นจี่":16,"CARNIVAL 20K - องุ่นว่านหางจระเข้":16,"CARNIVAL 20K - สับปะรด":16,"CARNIVAL 20K - ยาคูลท์":16,"CARNIVAL 20K - แยมสตรอว์เบอร์รี่":16,"CARNIVAL 20K - แยมบลูเบอร์รี่":16,"CARNIVAL 20K - ลิ้นจี่ไอซ์":16,"CARNIVAL 20K - ไอติมเผือก":16,"CARNIVAL 20K - ไอติมสตรอว์เบอร์รี่":16,"CARNIVAL 20K - เมล่อน":16,"CARNIVAL 20K - เรดบลู":16,"DUAL SMASH 20K - แตงโม":17,"DUAL SMASH 20K - มิ้นต์":17,"DUAL SMASH 20K - โคล่า":17,"DUAL SMASH 20K - นมกล้วย":17,"DUAL SMASH 20K - น้ำแร่":17,"DUAL SMASH 20K - องุ่น":17,"DUAL SMASH 20K - องุ่นอโล":17,"DUAL SMASH 20K - สตรอว์เบอร์รี่":17,"DUAL SMASH 20K - แอปเปิ้ล":17,"DUAL SMASH 20K - ชาหลงจิน":17,"DUAL SMASH 20K - ฮันนี่เลม่อน":17,"DUAL SMASH 20K - ยาคูลท์":17,"เครื่อง DUAL SMASH - สีดำ":42,"ELFBAR SWAP 25K - ฝรั่งมะม่วงส้ม":3,"ELFBAR SWAP 25K - พีชสตรอว์เบอร์รี่":3,"ELFBAR SWAP 25K - มะม่วง":3,"ELFBAR SWAP 25K - เมล่อน":3,"ELFBAR SWAP 25K - สตรอว์เบอร์รี่":3,"ELFBAR SWAP 25K - สตรอว์เบอร์รี่ชีสเค้ก":3,"ELFBAR SWAP 25K - สตรอว์เบอร์รี่องุ่นแอปเปิ้ล":3,"ELFBAR SWAP 25K - หมากฝรั่งแตงโม":3,"ELFBAR SWAP 25K - องุ่น":3,"ELFBAR SWAP 25K - ไอติมซอเลโร่":3,"ELFBAR SWAP 25K - ไอติมสตรอว์เบอร์รี่":3,"ELFBAR SWAP 25K - แอปเปิ้ลลิ้นจี่":3,"ELFBAR SWAP 25K - โคล่าเย็น":3,"ELFBAR SWAP 25K - มะนาวเย็น":3,"ELFBAR SWAP 25K - ชามะลิ":3,"ELFBAR SWAP 25K - ชาหลงจิน":3,"ELFBAR SWAP 25K - ชาองุ่นกวนอิน":3,"ELFBAR SWAP 25K - ดับเบิ้ลมิ้นต์":3,"ELFBAR SWAP 25K - น้ำแร่":3,"ELFBAR SWAP 25K - องุ่นเย็น":3,"ELFBAR 15K - องุ่นว่านหางจระเข้":18,"ELFBAR 15K - บลูเบอร์รี่เย็น":18,"ELFBAR 15K - องุ่นเย็น":18,"ELFBAR 15K - องุ่นเยลลี่":18,"ELFBAR 15K - มะม่วงเขียว":18,"ELFBAR 15K - ฝรั่งเย็น":18,"ELFBAR 15K - โคล่าเลม่อน":18,"ELFBAR 15K - ชามะนาว":18,"ELFBAR 15K - แฟนต้าลิ้นจี่":18,"ELFBAR 15K - พีชเย็น":18,"ELFBAR 15K - องุ่นซากุระ":18,"ELFBAR 15K - สตรอว์เบอร์รี่เย็น":18,"ELFBAR 15K - พีชสตรอว์เบอร์รี่":18,"ELFBAR 15K - เบอร์รี่":18,"ELFBAR 15K - เมล่อนแตงโม":18,"ELFBAR 15K - แตงโม":18,"เครื่อง ELFBAR JOINONE - สีเขียว":43,"เครื่อง ELFBAR JOINONE - สีดำ":43,"เครื่อง ELFBAR JOINONE - สีแดง":43,"เครื่อง ELFBAR JOINONE - สีน้ำเงิน":43,"เครื่อง ELFBAR JOINONE - สีม่วง":43,"เครื่อง ELFBAR JOINONE - สีส้ม":43,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  โคล่า":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  แตงโมเย็น":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) - แตงโมเลม่อน":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  บลูเบอร์รี่":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  ฝรั่ง":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  มิกซ์เบอร์รี่":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  มิ้นต์":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  เมล่อน":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  โยเกิร์ต":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -   ลิ้นจี่":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  สตรอว์เบอร์รี่":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  สตรอว์เบอร์รี่กล้วย":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -   สับปะรด":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  องุ่น":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) -  แอปเปิ้ลอโล":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) - แยมบลูเบอร์รี่":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) - เมนทอล":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) - ช็อคโกแลตมิ้นต์":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) - มะพร้าว":4,"ESKO BAR SWITCH 20K (หัวน้ำยา) - มะม่วง":4,"ESKO BAR 20K - โคล่า":19,"ESKO BAR 20K - แตงโม":19,"ESKO BAR 20K - แตงโมสตรอว์เบอร์รี่":19,"ESKO BAR 20K - บลูเบอร์รี่ไอซ์":19,"ESKO BAR 20K - บับเบิ้ลกัม":19,"ESKO BAR 20K - เบอร์รี่องุ่น":19,"ESKO BAR 20K - ฝรั่ง":19,"ESKO BAR 20K - มิกซ์เบอร์รี่":19,"ESKO BAR 20K - เมล่อน":19,"ESKO BAR 20K - สตรอว์เบอร์รี่":19,"ESKO BAR 20K - สตรอว์เบอร์รี่กล้วย":19,"ESKO BAR 20K - สตรอว์เบอร์รี่กีวี่":19,"ESKO BAR 20K - องุ่น":19,"ESKO BAR 20K - องุ่นเคียวโฮ":19,"ESKO BAR 20K - แอปเปิ้ลว่านหางจระเข้":19,"ESKO BAR 20K - ลิ้นจี่เย็น":19,"ESKO BAR 20K - ดับเบิ้ลมิ้นต์":19,"ESKO BAR 20K - กล้วยเย็น":19,"ESKO BAR 20K - มะม่วง":19,"ESKO BAR 20K - น้ำแร่":19,"ESKO BAR 20K - เรดเลม่อนโซดา":19,"ESKO BAR 20K - มิ้นต์เอ็กซ์ตร้า 5%":19,"ESKO BAR SWITCH 20K (KIT) - โคล่า":38,"ESKO BAR SWITCH 20K (KIT) - แตงโมเย็น":38,"ESKO BAR SWITCH 20K (KIT) - แตงโมเลม่อน":38,"ESKO BAR SWITCH 20K (KIT) - บลูเบอร์รี่":38,"ESKO BAR SWITCH 20K (KIT) - ฝรั่ง":38,"ESKO BAR SWITCH 20K (KIT) - มิกซ์เบอร์รี่":38,"ESKO BAR SWITCH 20K (KIT) - มิ้นต์":38,"ESKO BAR SWITCH 20K (KIT) - เมล่อน":38,"ESKO BAR SWITCH 20K (KIT) - โยเกิร์ต":38,"ESKO BAR SWITCH 20K (KIT) - ลิ้นจี่":38,"ESKO BAR SWITCH 20K (KIT) - สตรอว์เบอร์รี่":38,"ESKO BAR SWITCH 20K (KIT) -  สตรอว์เบอร์รี่กล้วย":38,"ESKO BAR SWITCH 20K (KIT) - สับปะรด":38,"ESKO BAR SWITCH 20K (KIT) - องุ่น":38,"ESKO BAR SWITCH 20K (KIT) -  แอปเปิ้ลอโล":38,"FREEBASE ESKOLIQ 30ML - โคล่า":60,"FREEBASE ESKOLIQ 30ML - มิกซ์เบอร์รี่":60,"FREEBASE ESKOLIQ 30ML - ไอซ์บลาสต์":60,"SALTNIC ESKOLIQ 30ML - โคล่า":58,"SALTNIC ESKOLIQ 30ML - มิกซ์เบอร์รี่":58,"INFY BAR 15K - โคล่าเลม่อน":22,"INFY BAR 15K - ซีซอล์ทเลม่อน":22,"INFY BAR 15K - แตงโม":22,"INFY BAR 15K - แตงโมลิ้นจี่":22,"INFY BAR 15K - พีชสตรอว์เบอร์รี่":22,"INFY BAR 15K - บลูเบอร์รี่":22,"INFY BAR 15K - แฟนต้าองุ่น":22,"INFY BAR 15K - มะม่วงโยเกิร์ต":22,"INFY BAR 15K - มิกซ์เบอร์รี่":22,"INFY BAR 15K - มิ้นต์":22,"INFY BAR 15K - เมล่อน":22,"INFY BAR 15K - ลิ้นจี่":22,"INFY BAR 15K - ลูกอมเปรี้ยว":22,"INFY BAR 15K - สตรอว์เบอร์รี่แตงโม":22,"INFY BAR 15K - องุ่นเคียวโฮ":22,"INFY BAR 15K - องุ่นลิ้นจี่":22,"INFY BAR 15K - มะนาว":22,"INFY BAR 15K - สับปะรดมะนาว":22,"INFY BAR 15K - โคล่า":22,"INFY BAR 15K - องุ่นแอปเปิ้ล":22,"INFY BAR PRO 20K - ดับเบิ้ลมิ้นต์":23,"INFY BAR PRO 20K - บลูไอซ์":23,"INFY BAR PRO 20K - โคล่า":23,"INFY BAR PRO 20K - มิกซ์เบอร์รี่":23,"INFY BAR PRO 20K - ลูกอมเรนโบว์":23,"INFY BAR PRO 20K - เบอร์รี่ชมพู":23,"INFY BAR PRO 20K - ลิ้นจี่เย็น":23,"INFY BAR PRO 20K - แตงโม":23,"INFY BAR PRO 20K - แตงโมสตรอว์เบอร์รี่":23,"INFY BAR PRO 20K - แตงโมลิ้นจี่":23,"INFY BAR PRO 20K - หมากฝรั่งแตงโม":23,"INFY BAR PRO 20K - สตรอว์เบอร์รี่":23,"INFY BAR PRO 20K - พีชสตรอว์เบอร์รี่":23,"INFY BAR PRO 20K - สตรอว์เบอร์รี่กล้วย":23,"INFY BAR PRO 20K - สตรอว์เบอร์รี่กีวี่":23,"INFY BAR PRO 20K - องุ่น":23,"INFY BAR PRO 20K - องุ่นลิ้นจี่":23,"INFY BAR PRO 20K - องุ่นว่านหางจระเข้":23,"INFY BAR PRO 20K - แตงโมมิ้นต์":23,"INFY BAR PRO 20K - ยาคูลท์":23,"INFY BAR PRO 20K - เรดบลู":23,"INFY BAR PRO 20K - มัทฉะลาเต้":23,"INFY BAR PRO 20K - ฝรั่งเสาวรส":23,"INFY BAR PRO 20K - ราสเบอร์รี่แตงโม":23,"INFY BAR PRO 20K - ไอติมสตรอว์เบอร์รี่":23,"INFY 12K - โคล่า":20,"INFY 12K - แตงโมลิ้นจี่":20,"INFY 12K - น้ำแร่":20,"INFY 12K - บลูเบอร์รี่":20,"INFY 12K - พีช":20,"INFY 12K - มิกซ์เบอร์รี่":20,"INFY 12K - มิกซ์สตรอว์เบอร์รี่":20,"INFY 12K - มิ้นต์":20,"INFY 12K - เมล่อน":20,"INFY 12K - ลิ้นจี่":20,"INFY 12K - ลูกอมสตรอว์เบอร์รี่":20,"INFY 12K - สตรอว์เบอร์รี่":20,"INFY 12K - สตรอว์เบอร์รี่กล้วย":20,"INFY 12K - สตรอว์เบอร์รี่กีวี่":20,"INFY 12K - สตรอว์เบอร์รี่แตงโม":20,"INFY 12K - องุ่นเคียวโฮ":20,"INFY 12K - องุ่นซากุระ":20,"INFY 12K - องุ่นโยโย่":20,"INFY 12K - องุ่นแอปเปิ้ล":20,"INFY 12K - ไอศกรีมสตรอว์เบอร์รี่":20,"INFY 12K - สตรอว์เบอร์รี่ราสเบอร์รี่":20,"INFY 12K - สไปร์ท":20,"INFY 12K - ส้มโซดา":20,"INFY 12K - หมากฝรั่งแตงโม":20,"INFY 12K - เลม่อนชมพู":20,"INFY 12K - ราสเบอร์รี่มัลเบอร์รี่":20,"INFY 12K - กัมมี่แบร์":20,"INFY 12K - ชาอู่หลงพีช":20,"INFY 12K - องุ่นหน้าร้อน":20,"INFY 12K - บานาน่าท๊อฟฟี่":20,"INFY 12K - ลิ้นจี่ราสเบอร์รี่":20,"INFY 20K - บลูเบอร์รี่":21,"INFY 20K - แตงโมลิ้นจี่":21,"INFY 20K - ลิ้นจี่":21,"INFY 20K - มิกซ์เบอร์รี่":21,"INFY 20K - มิ้นต์":21,"INFY 20K - สตรอว์เบอร์รี่กีวี่":21,"INFY 20K - สตรอว์เบอร์รี่แตงโม":21,"INFY 20K - องุ่นแอปเปิ้ล":21,"INFY 20K - องุ่นเคียวโฮ":21,"INFY 20K - องุ่นโยโย่":21,"INFY 20K - องุ่นลิ้นจี่":21,"INFY 20K - องุ่นอโล":21,"INFY 20K - พีช":21,"INFY 20K - แอปเปิ้ลอโล":21,"INFY 20K - สปาร์คกิ้งเลม่อน":21,"INFY 20K - น้ำแร่":21,"INFY 20K - โคล่า":21,"INFY 20K - สตรอว์เบอร์รี่กล้วย":21,"INFY 20K - เมนทอลฟรีซ":21,"INFY 20K - หมากฝรั่งองุ่น":21,"INFY 20K - หมากฝรั่งแตงโม":21,"INFY PLUS - โคล่า":10,"INFY PLUS - ชามะลิ":10,"INFY PLUS - แตงโมลิ้นจี่":10,"INFY PLUS - แตงโมสตรอว์เบอร์รี่":10,"INFY PLUS - น้ำส้มโซดา":10,"INFY PLUS - บลูเบอร์รี่":10,"INFY PLUS - พีช":10,"INFY PLUS - มะม่วงพีช":10,"INFY PLUS - มิ้นต์":10,"INFY PLUS - เยลลี่องุ่น":10,"INFY PLUS - ลิ้นจี่":10,"INFY PLUS - ลิ้นจี่ราสเบอร์รี่":10,"INFY PLUS - สตรอว์เบอร์รี่":10,"INFY PLUS - สตรอว์เบอร์รี่องุ่น":10,"INFY PLUS - สไปร์ท":10,"INFY PLUS - หมากฝรั่งองุ่น":10,"INFY PLUS - องุ่นกัมมี่":10,"INFY PLUS - องุ่นเคียวโฮ":10,"INFY PLUS - องุ่นแอปเปิ้ล":10,"INFY PLUS - แอปเปิ้ลแดง":10,"INFY PLUS - ไอศกรีมสตรอว์เบอร์รี่":10,"INFY PLUS - หมากฝรั่งเปรี้ยว":10,"INFY PLUS - แอปเปิ้ลอโล":10,"INFY PLUS - เชอร์รี่สตรอว์เบอร์รี่":10,"INFY PLUS - หมากฝรั่งสับปะรด":10,"INFY PLUS - ซีซอล์ทเลม่อน":10,"INFY PLUS - ผลไม้รวม":10,"INFY PLUS - แตงโมราสเบอร์รี่":10,"เครื่อง IQOS ILUMA I ONE - สีฟ้า":55,"เครื่อง IQOS ILUMA I ONE - สีส้ม":55,"เครื่อง IQOS ILUMA I ONE - สีม่วง":55,"เครื่อง IQOS ILUMA I ONE - สีดำ":55,"เครื่อง IQOS ILUMA I ONE - สีเขียว":55,"เครื่อง IQOS ILUMA I PRIME - สีดำ":56,"เครื่อง IQOS ILUMA I PRIME - สีฟ้า":56,"เครื่อง IQOS ILUMA I PRIME - สีเลือดหมู":56,"เครื่อง IQOS ILUMA I PRIME - สีเขียว":56,"เครื่อง IQOS ILUMA I PRIME - สีม่วง":56,"เครื่อง IQOS ILUMA I STANDARD - สีดำ":57,"เครื่อง IQOS ILUMA I STANDARD - สีฟ้า":57,"เครื่อง IQOS ILUMA I STANDARD - สีเขียว":57,"เครื่อง IQOS ILUMA I STANDARD - สีม่วงอ่อน":57,"เครื่อง IQOS ILUMA I STANDARD - สีส้ม":57,"เครื่อง IQOS ILUMA I STANDARD - สีม่วง":57,"TEREA IN - GREEN":52,"TEREA IN - BRIGHT WAVE":52,"TEREA IN - BLUE":52,"TEREA IN - BLACK GREEN":52,"TEREA IN - PURPLE WAVE":52,"TEREA IN - BRONZE":52,"TEREA IN - SIENNA":52,"TEREA IN - DIMENSION APRICITY":52,"TEREA IN - DIMENSION YUGEN":52,"TEREA IN - GOLDEN EDITION":52,"TEREA IN - RIVIERA PEARL":52,"TEREA IN - BERRINE EDITION":52,"TEREA IN - AUBURN EDITION":52,"TEREA IN - MULINT EDITION":52,"TEREA IN - SUN PEARL":52,"TEREA IN - BLACK RUBY":52,"TEREA IN - OASIS PEARL":52,"TEREA IN - BERMIN PEARL":52,"TEREA IN - PERINT PEARL":52,"TEREA JP - BALANCED REGULAR":53,"TEREA JP - BLACK MENTHOL":53,"TEREA JP - BLACK PURPLE MENTHOL":53,"TEREA JP - BLACK RUBY MENTHOL":53,"TEREA JP - FUSION MENTHOL":53,"TEREA JP - MENTHOL":53,"TEREA JP - MINT":53,"TEREA JP - OASIS PEARL":53,"TEREA JP - TROPICAL MENTHOL":53,"TEREA JP - PURPLE MENTHOL":53,"TEREA JP - REGULAR":53,"TEREA JP - RICH REGULAR":53,"TEREA JP - SMOOTH REGULAR":53,"TEREA JP - SUN PEARL":53,"TEREA JP - YELLOW MENTHOL":53,"TEREA JP - WARM REGULAR":53,"TEREA JP - BLACK FUCHSIA MENTHOL":53,"TEREA JP - BRIGHT MENTHOL":53,"TEREA JP - BLACK YELLOW MENTHOL":53,"TEREA JP - BLACK SUNSHINE MENTHOL":53,"TEREA JP - RUBY REGULAR":53,"TEREA JP - RIVIERA PEARL":53,"TEREA JP - CLEAR REGULAR":53,"TEREA JP - SHINE PEARL":53,"TEREA JP - VELVET PEARL":53,"TEREA JP - STARLING PEARL":53,"TEREA JP - STELLAR PEARL":53,"TEREA MY - ZING WAVE":54,"TEREA MY - TURQUOISE":54,"TEREA MY - RUSSET":54,"TEREA MY - BLUE":54,"TEREA MY - BLACK GREEN":54,"TEREA MY - PURPLE WAVE":54,"TEREA MY - SIENNA":54,"TEREA MY - OASIS PEARL":54,"TEREA MY - SUN PEARL":54,"TEREA MY - AMBER":54,"JOIWAY 12K - โคล่าเลม่อน":24,"JOIWAY 12K - โคล่า":24,"JOIWAY 12K - ลิ้นจี่":24,"JOIWAY 12K - แตงโม":24,"JOIWAY 12K - แอปเปิ้ลเขียว":24,"JOIWAY 12K - แฟนต้าเขียว":24,"JOIWAY 12K - เมล่อนฮอกไกโด":24,"JOIWAY 12K - มิ้นต์":24,"JOIWAY 12K - ส้มโซดา":24,"JOIWAY 12K - บลูเบอร์รี่":24,"JOIWAY 12K - องุ่น":24,"JOIWAY 12K - เสาวรส":24,"JOIWAY 12K - ลูกอมเรนโบว์":24,"JOIWAY 12K - สตรอว์เบอร์รี่":24,"JOIWAY 12K - ชามะนาว":24,"JOIWAY 12K - คุกกี้":24,"JOIWAY TWINS 20K - โคล่า / แอปเปิ้ลเขียว":25,"JOIWAY TWINS 20K - โคล่า / สตรอว์เบอร์รี่":25,"JOIWAY TWINS 20K - ลิ้นจี่ / คุกกี้":25,"JOIWAY TWINS 20K - ลูกอมเรนโบว์ / มิ้นต์":25,"JOIWAY TWINS 20K - ลูกอมเรนโบว์ / สตรอว์เบอร์รี่":25,"JOIWAY TWINS 20K - มิ้นต์ / สตรอว์เบอร์รี่":25,"JOIWAY TWINS 20K - องุ่น / บลูเบอร์รี่":25,"JOIWAY TWINS 20K - องุ่น / แตงโม":25,"JOIWAY TWINS 20K - องุ่น / ลิ้นจี่":25,"JOIWAY TWINS 20K - แอปเปิ้ลเขียว / คุกกี้":25,"JOIWAY TWINS 20K - แอปเปิ้ลเขียว / สตรอว์เบอร์รี่":25,"JOIWAY TWINS 20K - บลูเบอร์รี่ / แตงโม":25,"JOIWAY TWINS 20K - บลูเบอร์รี่ / ลิ้นจี่":25,"JOIWAY TWINS 20K - แตงโม / ลูกอมเรนโบว์":25,"JOIWAY TWINS 20K - แตงโม / ลิ้นจี่":25,"JOIWAY TWINS 20K - แตงโม / สตรอว์เบอร์รี่":25,"KARDINAL POUCH - MANGO (3MG)":63,"KARDINAL POUCH - PEPPERMINT (3MG)":63,"KARDINAL POUCH - COLA (3MG)":63,"KARDINAL POUCH - BLUEBERRY CITRUS (3MG)":63,"KARDINAL POUCH - ICE MINT (3MG)":63,"KARDINAL POUCH - PEPPERMINT (6MG)":63,"KARDINAL POUCH - COLA (6MG)":63,"KARDINAL POUCH - BLUEBERRY CITRUS (6MG)":63,"KARDINAL POUCH - ICE MINT (6MG)":63,"KARDINAL POUCH - MANGO (6MG)":63,"KS QUIK PRO 15K (หัวน้ำยา) - โคล่าเลม่อน":5,"KS QUIK PRO 15K (หัวน้ำยา) - ชานม":5,"KS QUIK PRO 15K (หัวน้ำยา) - แตงโม":5,"KS QUIK PRO 15K (หัวน้ำยา) - น้ำแร่":5,"KS QUIK PRO 15K (หัวน้ำยา) - บลูเบอร์รี่":5,"KS QUIK PRO 15K (หัวน้ำยา) - เมนทอล":5,"KS QUIK PRO 15K (หัวน้ำยา) - โยเกิร์ต":5,"KS QUIK PRO 15K (หัวน้ำยา) - ลิ้นจี่":5,"KS QUIK PRO 15K (หัวน้ำยา) - ลิ้นจี่แบล็คเคอร์แรนท์":5,"KS QUIK PRO 15K (หัวน้ำยา) - เลม่อนโซดา":5,"KS QUIK PRO 15K (หัวน้ำยา) - สตรอว์เบอร์รี่":5,"KS QUIK PRO 15K (หัวน้ำยา) - สับปะรด":5,"KS QUIK PRO 15K (หัวน้ำยา) - องุ่น":5,"KS QUIK PRO 15K (หัวน้ำยา) - องุ่นลิ้นจี่":5,"KS QUIK PRO 15K (หัวน้ำยา) - แอปเปิ้ลเปรี้ยว":5,"KS QUIK PRO 15K (หัวน้ำยา) - องุ่นเบอร์รี่":5,"KS Quik 6K - โคล่าเลม่อน":26,"KS Quik 6K - ชานมอู่หลง":26,"KS Quik 6K - แตงโม":26,"KS Quik 6K - น้ำแร่":26,"KS Quik 6K - บลูเบอร์รี่":26,"KS Quik 6K - ฝรั่ง":26,"KS Quik 6K - มะนาว":26,"KS Quik 6K - มะม่วง":26,"KS Quik 6K - มิกซ์เบอร์รี่":26,"KS Quik 6K - เมนทอล":26,"KS Quik 6K - เมล่อน":26,"KS Quik 6K - ยาสูบครีม":26,"KS Quik 6K - ยาสูบคลาสสิค":26,"KS Quik 6K - ลิ้นจี่":26,"KS Quik 6K - สตรอว์เบอร์รี่":26,"KS Quik 6K - สับปะรด":26,"KS Quik 6K - องุ่น":26,"KS Quik 6K - ไอศกรีมสตรอว์เบอร์รี่":26,"KS QUIK PRO 15K (KIT) - โคล่าเลม่อน":39,"KS QUIK PRO 15K (KIT) - ชานม":39,"KS QUIK PRO 15K (KIT) - แตงโม":39,"KS QUIK PRO 15K (KIT) - น้ำแร่":39,"KS QUIK PRO 15K (KIT) - บลูเบอร์รี่":39,"KS QUIK PRO 15K (KIT) - เมนทอล":39,"KS QUIK PRO 15K (KIT) - โยเกิร์ต":39,"KS QUIK PRO 15K (KIT) - ลิ้นจี่":39,"KS QUIK PRO 15K (KIT) - ลิ้นจี่แบล็คเคอร์แรนท์":39,"KS QUIK PRO 15K (KIT) - เลม่อนโซดา":39,"KS QUIK PRO 15K (KIT) - สตรอว์เบอร์รี่":39,"KS QUIK PRO 15K (KIT) - สับปะรด":39,"KS QUIK PRO 15K (KIT) - องุ่น":39,"KS QUIK PRO 15K (KIT) - องุ่นลิ้นจี่":39,"KS QUIK PRO 15K (KIT) - แอปเปิ้ลเปรี้ยว":39,"KS QUIK PRO 15K (KIT) - องุ่นเบอร์รี่":39,"LANA IRIS 24K - ชากวนอิน 3%":27,"LANA IRIS 24K - แตงโม 3%":27,"LANA IRIS 24K - น้ำแร่ 3%":27,"LANA IRIS 24K - ฝรั่ง 3%":27,"LANA IRIS 24K - มิกซ์เบอร์รี่ 3%":27,"LANA IRIS 24K - มิ้นต์ 3%":27,"LANA IRIS 24K - ลิ้นจี่ 3%":27,"LANA IRIS 24K - สตรอว์เบอร์รี่ 3%":27,"LANA IRIS 24K - สับปะรด 3%":27,"LANA IRIS 24K - ส้มองุ่น 3%":27,"LANA IRIS 24K - องุ่น 3%":27,"LANA IRIS 24K - โคล่า 3%":27,"LANA IRIS 24K - เลม่อนโคล่า 3%":27,"LANA IRIS 24K - ชากวนอิน 5%":27,"LANA IRIS 24K - มิ้นต์ 5%":27,"M SWITCH - ดับเบิ้ลมิ้นต์":6,"M SWITCH - บลูเบอร์รี่เย็น":6,"M SWITCH - พีชสตรอว์เบอร์รี่":6,"M SWITCH - มะม่วงเสาวรส":6,"M SWITCH - มิกซ์เบอร์รี่":6,"M SWITCH - สตรอว์เบอร์รี่":6,"M SWITCH - สตรอว์เบอร์รี่แตงโม":6,"M SWITCH - หมากฝรั่งแตงโม":6,"M SWITCH - องุ่น":6,"M SWITCH - องุ่นลิ้นจี่":6,"M SWITCH - องุ่นว่านหางจระเข้":6,"M SWITCH - เบอร์รี่ชมพู":6,"M SWITCH - แตงโม":6,"M SWITCH - แบล็คเบอร์รี่":6,"M SWITCH - แอปเปิ้ลว่านหางจระเข้":6,"M SWITCH - โคล่า":6,"M SWITCH - องุ่นเคียวโฮ":6,"MARBO 9K - โคล่า":29,"MARBO 9K - ดับเบิ้ลมิ้นต์":29,"MARBO 9K - แตงโม":29,"MARBO 9K - บลูไอซ์":29,"MARBO 9K - เบอร์รี่ชมพู":29,"MARBO 9K - พีช":29,"MARBO 9K - พีชสตรอว์เบอร์รี่":29,"MARBO 9K - แฟนต้าส้ม":29,"MARBO 9K - มิกซ์เบอร์รี่":29,"MARBO 9K - เยลลี่":29,"MARBO 9K - ลูกอมเรนโบว์":29,"MARBO 9K - สตรอว์เบอร์รี่":29,"MARBO 9K - สปาร์คกิ้งเลม่อน":29,"MARBO 9K - หมากฝรั่งแตงโม":29,"MARBO 9K - องุ่น":29,"MARBO 9K - องุ่นลิ้นจี่":29,"MARBO 9K - องุ่นว่านหางจระเข้":29,"MARBO 9K - แอปเปิ้ลเขียว":29,"MARBO 9K - สตรอว์เบอร์รี่มิลค์เชค":29,"MARBO 9K - เมนทอลฟรีส":29,"MARBO 9K - องุ่นเคียวโฮ":29,"MARBO 9K - แอปเปิ้ลเลม่อน":29,"MARBO 9K - บลูเบอร์รี่มิ้นต์":29,"MARBO 9K -  สตรอว์เบอร์รี่กีวี่":29,"MARBO 10K - บลูไอซ์":28,"MARBO 10K - เบอร์รี่ชมพู":28,"MARBO 10K - เบอร์รี่รวม":28,"MARBO 10K - แตงโม":28,"MARBO 10K - แตงโมมิ้นต์":28,"MARBO 10K - โคล่า":28,"MARBO 10K - มัทฉะลาเต้":28,"MARBO 10K - เมนทอล":28,"MARBO 10K - เลม่อนมิ้นต์":28,"MARBO 10K - สตรอว์เบอร์รี่กีวี่":28,"MARBO 10K - องุ่น":28,"MARBO 10K - องุ่นเคียวโฮ":28,"เครื่อง M ZERO NANO - สีดำ":46,"เครื่อง M ZERO NANO - สีขาว":46,"เครื่อง M ZERO NANO - สีชมพู":46,"เครื่อง M ZERO NANO - สีฟ้า":46,"เครื่อง M ZERO PRO - สีเขียว":47,"เครื่อง M ZERO PRO - สีชมพู":47,"เครื่อง M ZERO PRO - สีแดง":47,"เครื่อง M ZERO PRO - สีเงิน":47,"เครื่อง M ZERO PRO - สีดำ":47,"เครื่อง M ZERO PRO - สีเหลืองดำ":47,"เครื่อง M ZERO PRO - สีฟ้าม่วง":47,"เครื่อง M ZERO PRO - สีดำชมพู":47,"เครื่อง M SWITCH - สีดำ":44,"เครื่อง M SWITCH KIT - ดับเบิ้ลมิ้นต์":40,"เครื่อง M SWITCH KIT - บลูเบอร์รี่เย็น":40,"เครื่อง M SWITCH KIT - พีชสตรอว์เบอร์รี่":40,"เครื่อง M SWITCH KIT - มะม่วงเสาวรส":40,"เครื่อง M SWITCH KIT - มิกซ์เบอร์รี่":40,"เครื่อง M SWITCH KIT - สตรอว์เบอร์รี่":40,"เครื่อง M SWITCH KIT - สตรอว์เบอร์รี่แตงโม":40,"เครื่อง M SWITCH KIT - หมากฝรั่งแตงโม":40,"เครื่อง M SWITCH KIT - องุ่น":40,"เครื่อง M SWITCH KIT - องุ่นลิ้นจี่":40,"เครื่อง M SWITCH KIT - องุ่นว่านหางจระเข้":40,"เครื่อง M SWITCH KIT - เบอร์รี่ชมพู":40,"เครื่อง M SWITCH KIT - แตงโม":40,"เครื่อง M SWITCH KIT - แบล็คเบอร์รี่":40,"เครื่อง M SWITCH KIT - แอปเปิ้ลว่านหางจระเข้":40,"เครื่อง M SWITCH KIT - โคล่า":40,"เครื่อง M SWITCH KIT - องุ่นเคียวโฮ":40,"FREEBASE MARBO 30ML - ทอง":61,"FREEBASE MARBO 30ML - ชมพู":61,"FREEBASE MARBO 30ML - ฟ้า":61,"FREEBASE MARBO 30ML - ม่วง":61,"SALTNIC MARBO 30ML - เขียว":59,"SALTNIC MARBO 30ML - ชมพู":59,"SALTNIC MARBO 30ML - ดำ":59,"SALTNIC MARBO 30ML - ทอง":59,"SALTNIC MARBO 30ML - น้ำเงิน":59,"SALTNIC MARBO 30ML - ม่วง":59,"SALTNIC MARBO 30ML - เงิน":59,"SALTNIC MARBO 30ML - แดง":59,"SALTNIC MARBO 30ML 50% - ม่วง":59,"MARBO ZERO - เกรปฟรุต":11,"MARBO ZERO - โคล่า":11,"MARBO ZERO - ชาผลไม้":11,"MARBO ZERO - ชาอู่หลง":11,"MARBO ZERO - ซิก้าร์":11,"MARBO ZERO - แตงโม":11,"MARBO ZERO - น้ำแร่":11,"MARBO ZERO - บลูเบอร์รี่":11,"MARBO ZERO - พีช":11,"MARBO ZERO - พีชสตรอว์เบอร์รี่":11,"MARBO ZERO - มะม่วง":11,"MARBO ZERO - มิกซ์เบอร์รี่":11,"MARBO ZERO - มิ้นต์":11,"MARBO ZERO - ลิ้นจี่":11,"MARBO ZERO - เลม่อน":11,"MARBO ZERO - ส้มยูสุ":11,"MARBO ZERO - สับปะรด":11,"MARBO ZERO - องุ่น":11,"MARBO ZERO - องุ่นว่านหางจระเข้":11,"MARBO ZERO - แอปเปิ้ลเขียว":11,"MARBO ZERO 5% - โคล่า":11,"MARBO ZERO 5% - แตงโม":11,"MARBO ZERO 5% - เบอร์รี่ชมพู":11,"MARBO ZERO 5% - พีชสตรอว์เบอร์รี่":11,"MARBO ZERO 5% - มิกซ์เบอร์รี่":11,"MARBO ZERO 5% - มิ้นต์":11,"MARBO ZERO 5% - สตรอว์เบอร์รี่กล้วย":11,"MARBO ZERO 5% - องุ่น":11,"MARBO ZERO 5% - องุ่นว่านหางจระเข้":11,"MARBO ZERO 5% - แอปเปิ้ลเขียว":11,"MARBO ZERO 5% - มิ้นต์ฟรีซ":11,"MARBO 9K (โคลน) - ดับเบิ้ลมิ้นต์":30,"MARBO 9K (โคลน) - บลูไอซ์":30,"MARBO 9K (โคลน) - พีช":30,"MARBO 9K (โคลน) - พีชสตรอว์เบอร์รี่":30,"MARBO 9K (โคลน) - มิกซ์เบอร์รี่":30,"MARBO 9K (โคลน) - ลูกอมเรนโบว์":30,"MARBO 9K (โคลน) - สตรอว์เบอร์รี่":30,"MARBO 9K (โคลน) - สปาร์คกิ้งเลม่อน":30,"MARBO 9K (โคลน) - หมากฝรั่งแตงโม":30,"MARBO 9K (โคลน) - องุ่น":30,"MARBO 9K (โคลน) - องุ่นลิ้นจี่":30,"MARBO 9K (โคลน) - องุ่นว่านหางจระเข้":30,"MARBO 9K (โคลน) - เบอร์รี่ชมพู":30,"MARBO 9K (โคลน) - เยลลี่":30,"MARBO 9K (โคลน) - แตงโม":30,"MARBO 9K (โคลน) - แฟนต้าส้ม":30,"MARBO 9K (โคลน) - แอปเปิ้ลเขียว":30,"MARBO 9K (โคลน) - โคล่า":30,"MARBO 9K (โคลน) - สตรอว์เบอร์รี่มิลค์เชค":30,"MARBO 9K (โคลน) - เมนทอลฟรีส":30,"MARBO 9K (โคลน) - องุ่นเคียวโฮ":30,"MARBO 9K (โคลน) - แอปเปิ้ลเลม่อน":30,"MARBO 9K (โคลน) - บลูเบอร์รี่มิ้นต์":30,"MARBO 9K (โคลน) - สตรอว์เบอร์รี่กีวี่":30,"เครื่อง M SWITCH - สีดำ (โคลน)":44,"FREEBASE PHATJUICE 30ML - องุ่นยาว":62,"RELX BOOST POD - กล้วย":7,"RELX BOOST POD - บลูเบอร์รี่":7,"RELX BOOST POD - โคล่า":7,"RELX BOOST POD - ดับเบิ้ลมิ้นต์":7,"RELX BOOST POD - องุ่น":7,"RELX BOOST POD - ชามะลิ":7,"RELX BOOST POD - ลูกอมเลม่อนมิ้นต์":7,"RELX BOOST POD - น้ำแร่":7,"RELX BOOST POD - รวมมิตรมิกซ์เบอร์รี่":7,"RELX BOOST POD - สับปะรด":7,"RELX BOOST POD - ฝรั่ง":7,"RELX BOOST POD - ลูกอม":7,"RELX BOOST POD - แตงโม":7,"RELX BOOST POD - สตรอว์เบอร์รี่แตงโม":7,"RELX BOOST POD - เบอร์รี่ชมพู":7,"RELX BOOST POD - มะเฟือง":7,"RELX BOOST POD - คูลมิ้นต์":7,"RELX BOOST POD  - ลิ้นจี่":7,"RELX BOOST POD  - สเปียร์มิ้นต์":7,"RELX BOOST POD  - หมากฝรั่งแตงโม":7,"RELX BOOST POD  - แอปเปิ้ลว่านหางจระเข้":7,"RELX BOOST POD  - พีชสตรอว์เบอร์รี่":7,"RELX BOOST POD  - สตรอว์เบอร์รี่กล้วย":7,"RELX BOOST POD 5% - ดับเบิ้ลมิ้นต์":7,"RELX BOOST POD 5% - องุ่น":7,"RELX BOOST POD 5% - แตงโม":7,"RELX BOOST POD 5% - ยาสูบคลาสสิค":7,"RELX BOOST POD 5% - โคล่า":7,"RELX BOOST POD 5% - รวมมิตรมิกซ์เบอร์รี่":7,"RELX BOOST POD 5% - พีชสตรอว์เบอร์รี่":7,"RELX BOOST POD 5% - สตรอว์เบอร์รี่กล้วย":7,"RELX CLEAR 18K 3% - กาแฟโกปิโก้":8,"RELX CLEAR 18K 3% - ดับเบิ้ลมิ้นต์":8,"RELX CLEAR 18K 3% - แตงโม":8,"RELX CLEAR 18K 3% - น้ำส้มโซดา":8,"RELX CLEAR 18K 3% - น้ำแร่":8,"RELX CLEAR 18K 3% - สเปียร์มิ้นต์":8,"RELX CLEAR 18K 3% - สับปะรด":8,"RELX CLEAR 18K 3% - องุ่นอโล":8,"RELX CLEAR 18K 3% - องุ่น":8,"RELX CLEAR 18K 3% - แอปเปิ้ลเขียว":8,"RELX POD CLEAR 18K 3% - รวมมิตรเบอร์รี่":8,"RELX POD CLEAR 18K 3% - ไอติมสตรอว์เบอร์รี่":8,"RELX POD CLEAR 18K 3% - โคล่า":8,"RELX POD CLEAR 18K 3% - สตรอว์เบอร์รี่โซดา":8,"RELX POD CLEAR 18K 3% - มะม่วงเสาวรส":8,"RELX POD CLEAR 18K 3% - เมล่อน":8,"RELX CLEAR 18K 5% - ดับเบิ้ลมิ้นต์":8,"RELX CLEAR 18K 5% - แตงโม":8,"RELX CLEAR 18K 5% - องุ่น":8,"RELX DIVA 30K 3% - โคล่า":31,"RELX DIVA 30K 3% - ดับเบิ้ลมิ้นต์":31,"RELX DIVA 30K 3% - แตงโม":31,"RELX DIVA 30K 3% - น้ำแร่":31,"RELX DIVA 30K 3% - น้ำส้มโซดา":31,"RELX DIVA 30K 3% - มะม่วงเสาวรส":31,"RELX DIVA 30K 3% - มิกซ์เบอร์รี่":31,"RELX DIVA 30K 3% - เมล่อน":31,"RELX DIVA 30K 3% - สเปียร์มิ้นต์":31,"RELX DIVA 30K 3% - องุ่น":31,"RELX DIVA 30K 3% - องุ่นอโล":31,"RELX DIVA 30K 3% - ไอติมสตรอว์เบอร์รี่":31,"RELX DIVA 30K 5% - กาแฟโกปิโก้":31,"RELX DIVA 30K 5% - โคล่า":31,"RELX DIVA 30K 5% - ดับเบิ้ลมิ้นต์":31,"RELX DIVA 30K 5% - แตงโม":31,"RELX DIVA 30K 5% - องุ่น":31,"RELX SMASH GO 12K - แอปเปิ้ล 3%":32,"RELX SMASH GO 12K - เสาวรส 3%":32,"RELX SMASH GO 12K - องุ่น 3%":32,"RELX SMASH GO 12K - องุ่นลิ้นจี่ 3%":32,"RELX SMASH GO 12K - พีชสตรอว์เบอร์รี่ 3%":32,"RELX SMASH GO 12K - มะม่วง 3%":32,"RELX SMASH GO 12K - แตงโม 3%":32,"RELX SMASH GO 12K - เบอร์รี่รวม 3%":32,"RELX SMASH GO 12K - ดับเบิ้ลมิ้นต์ 3%":32,"RELX SMASH GO 12K - โคล่า 3%":32,"RELX SMASH GO 12K - ชาอู่หลง 3%":32,"RELX SMASH GO 12K - บลูเบอร์รี่เย็น 3%":32,"RELX SMASH GO 12K - เบอร์รี่ชมพู 3%":32,"RELX SMASH GO 12K - ฝรั่ง 3%":32,"RELX SMASH GO 12K - ลิ้นจี่ 3%":32,"RELX SMASH GO 12K - สตรอว์เบอร์รี่เย็น 3%":32,"RELX SMASH GO 12K - สับปะรดเย็น 3%":32,"RELX SMASH GO 12K - องุ่นอโล 3%":32,"RELX SMASH GO 12K - หมากฝรั่งแตงโม 3%":32,"RELX SMASH GO 12K - แตงโม 5%":32,"RELX SMASH GO 12K - ดับเบิ้ลมิ้นต์ 5%":32,"RELX SMASH GO 12K - องุ่น 5%":32,"RELX SMASH GO 12K - โคล่า 5%":32,"RELX SMASH GO 12K - คูลมิ้นต์ 5%":32,"RELX SMASH GO 12K - เบอร์รี่รวม 5%":32,"RELX SMASH GO 12K - ยาสูบคลาสสิค 5%":32,"RELX SMASH GO 12K - สเปียร์มิ้นต์ 5%":32,"RELX SPARTA 20K - โคล่า":33,"RELX SPARTA 20K - ชาอู่หลง":33,"RELX SPARTA 20K - ดับเบิ้ลมิ้นต์":33,"RELX SPARTA 20K - แตงโม":33,"RELX SPARTA 20K - น้ำแร่":33,"RELX SPARTA 20K - บลูเบอร์รี่":33,"RELX SPARTA 20K - พีชสตรอเบอร์รี่":33,"RELX SPARTA 20K - เยลลี่":33,"RELX SPARTA 20K - รวมมิตรเบอร์รี่":33,"RELX SPARTA 20K - ราสเบอร์รี่มิ้นติ์":33,"RELX SPARTA 20K - ลูกกวาด":33,"RELX SPARTA 20K - สตรอเบอร์รี่":33,"RELX SPARTA 20K - สัปปะรด":33,"RELX SPARTA 20K - องุ่น":33,"RELX SPARTA 20K - องุ่นลิ้นจี่":33,"RELX SPARTA 20K - แอปเปิ้ล":33,"RELX SPARTA 20K - เบอร์รี่ชมพู":33,"RELX SPARTA 20K - โพล่าร์มิ้นต์":33,"RELX SPARTA 20K - หมากฝรั่งแตงโม":33,"RELX SPARTA 20K - ลิ้นจี่":33,"RELX SPARTA 20K - องุ่นอโล":33,"เครื่อง RELX CREATOR 20K - สีดำ":48,"เครื่อง RELX CREATOR 20K - สีเทา-เหลือง":48,"เครื่อง RELX ESSENTIAL 2 - สีเทา":49,"เครื่อง RELX ESSENTIAL 2 - สีดำ":49,"เครื่อง RELX ESSENTIAL 2 - สีเงิน":49,"เครื่อง RELX ESSENTIAL 2 - สีฟ้าม่วง":49,"เครื่อง RELX INFINITY 2+ - สีเขียว":50,"เครื่อง RELX INFINITY 2+ - สีเงิน":50,"เครื่อง RELX INFINITY 2+ - สีดำ":50,"เครื่อง RELX INFINITY 2+ - สีเทา":50,"เครื่อง RELX INFINITY 2+ - สีบรอนซ์ทอง":50,"เครื่อง RELX INFINITY 2+ - สีโรสโกลด์":50,"เครื่อง RELX INFINITY 2+ - สีขาว":50,"RELX INFINITY - โคล่า":12,"RELX INFINITY - ชาเขียวมะลิ":12,"RELX INFINITY - ชาดอกชบาเย็น":12,"RELX INFINITY - ชาดำเย็น":12,"RELX INFINITY - ชาไทย":12,"RELX INFINITY - ชาพีช":12,"RELX INFINITY - ชามะนาวเย็น":12,"RELX INFINITY - ชาหลงจินเย็น":12,"RELX INFINITY - ชาอู่หลงเย็น":12,"RELX INFINITY - แตงโม":12,"RELX INFINITY - ถั่วเขียว":12,"RELX INFINITY - นํ้าส้มโซดา":12,"RELX INFINITY - น้ำเขียวโซดา":12,"RELX INFINITY - น้ำผึ้งส้มโอ":12,"RELX INFINITY - เผือก":12,"RELX INFINITY - ฝรั่ง":12,"RELX INFINITY - มะนาวเย็น":12,"RELX INFINITY - มะม่วง":12,"RELX INFINITY - เมล่อน":12,"RELX INFINITY - รูทเบียร์":12,"RELX INFINITY - ลิ้นจี่":12,"RELX INFINITY - ไวท์คอฟฟี่":12,"RELX INFINITY - สตรอว์เบอร์รี่":12,"RELX INFINITY - สไปรท์":12,"RELX INFINITY - เสาวรส":12,"RELX INFINITY - องุ่น":12,"RELX INFINITY - องุ่นเขียว":12,"RELX INFINITY - องุ่นแอปเปิ้ล":12,"RELX INFINITY - แอปเปิ้ลเขียว":12,"RELX INFINITY 5% - แตงโม":12,"RELX INFINITY 5% - เปปเปอร์มิ้นต์":12,"RELX INFINITY 5% - มิกซ์เบอร์รี่":12,"RELX INFINITY 5% - มิ้นต์เอ็กซ์ตร้า":12,"RELX INFINITY 5% - มิ้นต์ฟรีซ":12,"RELX INFINITY 5% - ยาสูบคลาสสิค":12,"RELX INFINITY 5% - ยาสูบร้อน":12,"RELX INFINITY 5% - เลม่อนมิ้นต์":12,"RELX INFINITY 5% - สเปียร์มิ้นต์":12,"RELX INFINITY 5% - องุ่น":12,"RELX INFINITY 5% - แอปเปิ้ลเขียว":12,"RELX INFINITY 5% - ซิตรัส":12,"RELX INFINITY 5% - ยาสูบมิ้นต์":12,"RELX INFINITY 5% - ราสเบอร์รี่มิ้นต์":12,"RELX INFINITY 5% - ไอซ์สปาร์คกิ้ง":12,"RELX INFINITY 5% - สตรอว์เบอร์รี่":12,"RELX INFINITY 5% - สับปะรด":12,"RELX LARGE - ลิ้นจี่":13,"RELX LARGE - องุ่น":13,"RELX LARGE - องุ่นแอปเปิ้ล":13,"RELX LARGE - แอปเปิ้ลเขียว":13,"RELX LARGE 5% - โคล่า":13,"RELX LARGE 5% - ชาหลงจิน":13,"RELX LARGE 5% - บลูเบอร์รี่":13,"RELX LARGE 5% - พีช":13,"RELX LARGE 5% - พีชสตรอว์เบอร์รี่":13,"RELX ULTRA 3% - ดับเบิ้ลมิ้นต์":14,"RELX ULTRA 3% - แตงโม":14,"RELX ULTRA 3% - บลูเบอร์รี่":14,"RELX ULTRA 3% - เบอร์รี่ชมพู":14,"RELX ULTRA 3% - มะม่วงเขียว":14,"RELX ULTRA 3% - องุ่นอโล":14,"RELX ULTRA 5% - ดับเบิ้ลมิ้นต์":14,"RELX ULTRA 5% - พีชสตรอว์เบอร์รี่":14,"RELX ULTRA 5% - มิกซ์เบอร์รี่":14,"RELX ULTRA 5% - ลิ้นจี่":14,"RELX ULTRA 5% - สับปะรด":14,"RELX ULTRA 5% - องุ่นอโล":14,"RELX ULTRA 5% - แอปเปิ้ลอโล":14,"RELX ULTRA 5% - โคล่า":14,"RELX ULTRA 5% - เบอร์รี่ชมพู":14,"SONIC 8K - กัมมี่แบร์":34,"SONIC 8K - โคล่า":34,"SONIC 8K - แตงโม":34,"SONIC 8K - น้ำแร่":34,"SONIC 8K - มิกซ์เบอร์รี่":34,"SONIC 8K - มิ้นต์":34,"SONIC 8K - ยาคูลท์":34,"SONIC 8K - สตรอว์เบอร์รี่":34,"SONIC 8K - องุ่น":34,"SONIC 8K - แอปเปิ้ลเขียว":34,"STAR 2,500 - กล้วย":35,"STAR 2,500 - โคล่า":35,"STAR 2,500 - แตงโม":35,"STAR 2,500 - น้ำแร่":35,"STAR 2,500 - บลูเบอร์รี่":35,"STAR 2,500 - พีช":35,"STAR 2,500 - มะม่วง":35,"STAR 2,500 - มิกซ์เบอร์รี่":35,"STAR 2,500 - มิ้นต์":35,"STAR 2,500 - ลิ้นจี่":35,"STAR 2,500 - สตรอว์เบอร์รี่":35,"STAR 2,500 - องุ่น":35,"VAZER RELOAD 15K (หัวน้ำยา) - โคล่า":9,"VAZER RELOAD 15K (หัวน้ำยา) - แตงโม":9,"VAZER RELOAD 15K (หัวน้ำยา) - บลูเบอร์รี่":9,"VAZER RELOAD 15K (หัวน้ำยา) - เบอร์รี่รวม":9,"VAZER RELOAD 15K (หัวน้ำยา) - พีช":9,"VAZER RELOAD 15K (หัวน้ำยา) - มิ้นต์เย็น":9,"VAZER RELOAD 15K (หัวน้ำยา) - รูทเบียร์":9,"VAZER RELOAD 15K (หัวน้ำยา) - ลิ้นจี่":9,"VAZER RELOAD 15K (หัวน้ำยา) - ลูกอมสตรอว์เบอร์รี่":9,"VAZER RELOAD 15K (หัวน้ำยา) - เลม่อนโซดา":9,"VAZER RELOAD 15K (หัวน้ำยา) - สับปะรด":9,"VAZER RELOAD 15K (หัวน้ำยา) - องุ่นเย็น":9,"VAZER RELOAD 15K (หัวน้ำยา) - องุ่นลิ้นจี่":9,"VAZER RELOAD 15K (หัวน้ำยา) - องุ่นโอซาก้า":9,"VAZER RELOAD 15K (หัวน้ำยา) - แอปเปิ้ลฟูจิ":9,"เครื่อง VAZER RELOAD - สีดำ":51,"VAZER RELOAD 15K (KIT) - โคล่า":41,"VAZER RELOAD 15K (KIT) - มิ้นต์เย็น":41,"VAZER RELOAD 15K (KIT) - ลูกอมสตรอว์เบอร์รี่":41,"VAZER RELOAD 15K (KIT) - องุ่นเย็น":41,"VAZER RELOAD 15K (KIT) - แตงโม":41,"VOSOON 23K - ชาหลงจิน":37,"VOSOON 23K - แตงโม":37,"VOSOON 23K - บลูเบอร์รี่เย็น":37,"VOSOON 23K - ฝรั่งเสาวรส":37,"VOSOON 23K - พีชสตรอว์เบอร์รี่":37,"VOSOON 23K - มิ้นต์ฟรีซ":37,"VOSOON 23K - ลิ้นจี่เย็น":37,"VOSOON 23K - องุ่นเย็น":37,"VOSOON 23K - แอปเปิ้ลอโล":37,"VOSOON 23K - โคล่า":37,"V PLUS 16K - กัมมี่แบร์":36,"V PLUS 16K - โคล่า":36,"V PLUS 16K - แตงโม":36,"V PLUS 16K - บลูเบอร์รี่":36,"V PLUS 16K - พีชสตรอว์เบอร์รี่":36,"V PLUS 16K - มิกซ์เบอร์รี่":36,"V PLUS 16K - มิ้นต์":36,"V PLUS 16K - ลิ้นจี่":36,"V PLUS 16K - ลูกอมเรนโบว์":36,"V PLUS 16K - สตรอว์เบอร์รี่":36,"V PLUS 16K - สตรอว์เบอร์รี่ราสเบอร์รี่":36,"V PLUS 16K - หมากฝรั่งแตงโม":36,"V PLUS 16K - องุ่น":36,"V PLUS 16K - องุ่นเคียวโฮ":36,"V PLUS 16K - แอปเปิ้ล":36,"V PLUS 16K - แอปเปิ้ลชิชา":36,"ZAR POUCH - FRESH MINT (3MG)":64,"ZAR POUCH - LEMON CRUSH (3MG)":64,"ZAR POUCH - COLA (3MG)":64,"ZAR POUCH - CITRUS (3MG)":64,"ZAR POUCH - WATERMELON (3MG)":64,"ZAR POUCH - FRESH MINT (6MG)":64,"ZAR POUCH - LEMON CRUSH (6MG)":64,"ZAR POUCH - COLA (6MG)":64,"ZAR POUCH - CITRUS (6MG)":64,"ZAR POUCH - WATERMELON (6MG)":64,"ZYN POUCH - SPEARMINT (1.5MG)":65,"ZYN POUCH - PEACH (1.5MG)":65,"ZYN POUCH - COFFEE (1.5MG)":65,"ZYN POUCH - COOL MINT (3MG)":65,"ZYN POUCH - SPEARMINT (3MG)":65,"ZYN POUCH - PEACH (3MG)":65,"ZYN POUCH - COFFEE (3MG)":65,"ZYN POUCH - COOL MINT (6MG)":65};
const MENU_MSG = "เมนูสินค้า\nต้องการสั่งซื้อสินค้า สามารถดูเมนูจากลิงก์นี้ได้เลยค่ะ 💕\nhttps://cutt.ly/abc-menu";
// 💵 ตารางราคาต่อชิ้น (บาท) — โค้ดคิดเงินเอง ไม่ให้ AI คิด (กันบวกเลขผิด)
const PRICE = {
  "RELX DIVA 30K": 490, "LANA IRIS 24K": 410, "CARNIVAL 20K": 399, "ESKO BAR 20K": 399,
  "INFY 20K": 399, "INFY BAR PRO 20K": 399, "JOIWAY TWINS 20K": 399, "MARBO 10K": 399,
  "RELX SPARTA 20K": 399, "VOSOON 23K": 399, "V PLUS 16K": 370, "ELFBAR 15K": 350,
  "INFY 12K": 350, "MARBO 9K": 350, "DUAL SMASH 20K": 320, "JOIWAY 12K": 320,
  "RELX SMASH GO 12K": 320, "INFY BAR 15K": 299, "MARBO 9K (โคลน)": 290, "KS Quik 6K": 280,
  "ABC 8K": 250, "SONIC 8K": 250, "STAR 2,500": 150, "STAR 2500": 150,
  "RELX POD CLEAR 18K": 390, "ELFBAR SWAP 25K": 379, "ESKO BAR SWITCH 20K (KIT)": 499,
  "ESKO BAR SWITCH 20K": 350, "KS QUIK PRO 15K (KIT)": 499, "KS QUIK PRO 15K": 350,
  "M SWITCH 15K (KIT)": 499, "M SWITCH 15K (โคลน)": 200, "M SWITCH": 350,
  "RELX BOOST POD": 350, "VAZER RELOAD 15K (KIT)": 450, "VAZER RELOAD 15K": 330,
  "ABC TANK 22K": 320, "ABC TANK": 320, "ABC LEGO 20K": 299, "ABC LEGO": 299,
  "INFY PLUS": 140, "MARBO ZERO": 140, "RELX INFINITY": 140, "RELX LARGE": 140, "RELX ULTRA": 120,
  "เครื่อง RELX INFINITY 2+": 990, "เครื่อง M ZERO PRO": 890, "เครื่อง M ZERO NANO": 690,
  "เครื่อง RELX ESSENTIAL 2": 490, "เครื่อง ELFBAR JOINONE": 349, "เครื่อง M SWITCH 15K": 250,
  "เครื่อง RELX CREATOR 20K": 250, "เครื่อง VAZER RELOAD": 220, "เครื่อง DUAL SMASH": 200
};
const FLAVORS = {"ABC LEGO 20K":{"p":299,"f":["ดับเบิ้ลมิ้นต์ 3%","น้ำแร่ 3%","มิกซ์เบอร์รี่ 3%","องุ่น 3%","โคล่า 3%","ชามะลิ 3%","สับปะรด 3%","แตงโม 3%","ดับเบิ้ลมิ้นต์ 5%","มิกซ์เบอร์รี่ 5%","องุ่น 5%","แตงโม 5%"]},"ABC TANK 22K":{"p":320,"f":["ดับเบิ้ลมิ้นต์ 3%","บลูเบอร์รี่เย็น 3%","พีชสตรอว์เบอร์รี่ 3%","มิกซ์เบอร์รี่ 3%","แตงโม 3%","องุ่น 3%","องุ่นลิ้นจี่ 3%","โคล่า 3%","ดับเบิ้ลมิ้นต์ 5%","แตงโม 5%","องุ่น 5%","โคล่า 5%"]},"ELFBAR SWAP 25K":{"p":379,"f":["ฝรั่งมะม่วงส้ม","พีชสตรอว์เบอร์รี่","มะม่วง","เมล่อน","สตรอว์เบอร์รี่","สตรอว์เบอร์รี่ชีสเค้ก","สตรอว์เบอร์รี่องุ่นแอปเปิ้ล","หมากฝรั่งแตงโม","องุ่น","ไอติมซอเลโร่","ไอติมสตรอว์เบอร์รี่","แอปเปิ้ลลิ้นจี่","โคล่าเย็น","มะนาวเย็น","ชามะลิ","ชาหลงจิน","ชาองุ่นกวนอิน","ดับเบิ้ลมิ้นต์","น้ำแร่","องุ่นเย็น"]},"ESKO BAR SWITCH 20K":{"p":350,"f":["โคล่า","แตงโมเย็น","แตงโมเลม่อน","บลูเบอร์รี่","ฝรั่ง","มิกซ์เบอร์รี่","มิ้นต์","เมล่อน","โยเกิร์ต","ลิ้นจี่","สตรอว์เบอร์รี่","สตรอว์เบอร์รี่กล้วย","สับปะรด","องุ่น","แอปเปิ้ลอโล","แยมบลูเบอร์รี่","เมนทอล","ช็อคโกแลตมิ้นต์","มะพร้าว","มะม่วง"]},"KS QUIK PRO 15K":{"p":350,"f":["โคล่าเลม่อน","ชานม","แตงโม","น้ำแร่","บลูเบอร์รี่","เมนทอล","โยเกิร์ต","ลิ้นจี่","ลิ้นจี่แบล็คเคอร์แรนท์","เลม่อนโซดา","สตรอว์เบอร์รี่","สับปะรด","องุ่น","องุ่นลิ้นจี่","แอปเปิ้ลเปรี้ยว","องุ่นเบอร์รี่"]},"M SWITCH":{"p":350,"f":["ดับเบิ้ลมิ้นต์","บลูเบอร์รี่เย็น","พีชสตรอว์เบอร์รี่","มะม่วงเสาวรส","มิกซ์เบอร์รี่","สตรอว์เบอร์รี่","สตรอว์เบอร์รี่แตงโม","หมากฝรั่งแตงโม","องุ่น","องุ่นลิ้นจี่","องุ่นว่านหางจระเข้","เบอร์รี่ชมพู","แตงโม","แบล็คเบอร์รี่","แอปเปิ้ลว่านหางจระเข้","โคล่า","องุ่นเคียวโฮ"]},"RELX BOOST POD":{"p":350,"f":["กล้วย","บลูเบอร์รี่","โคล่า","ดับเบิ้ลมิ้นต์","องุ่น","ชามะลิ","ลูกอมเลม่อนมิ้นต์","น้ำแร่","รวมมิตรมิกซ์เบอร์รี่","สับปะรด","ฝรั่ง","ลูกอม","แตงโม","สตรอว์เบอร์รี่แตงโม","เบอร์รี่ชมพู","มะเฟือง","คูลมิ้นต์","ลิ้นจี่","สเปียร์มิ้นต์","หมากฝรั่งแตงโม","แอปเปิ้ลว่านหางจระเข้","พีชสตรอว์เบอร์รี่","สตรอว์เบอร์รี่กล้วย","ดับเบิ้ลมิ้นต์","องุ่น","แตงโม","ยาสูบคลาสสิค","โคล่า","รวมมิตรมิกซ์เบอร์รี่","พีชสตรอว์เบอร์รี่","สตรอว์เบอร์รี่กล้วย"]},"RELX POD CLEAR 18K":{"p":390,"f":["กาแฟโกปิโก้","ดับเบิ้ลมิ้นต์","แตงโม","น้ำส้มโซดา","น้ำแร่","สเปียร์มิ้นต์","สับปะรด","องุ่นอโล","องุ่น","แอปเปิ้ลเขียว","รวมมิตรเบอร์รี่","ไอติมสตรอว์เบอร์รี่","โคล่า","สตรอว์เบอร์รี่โซดา","มะม่วงเสาวรส","เมล่อน","ดับเบิ้ลมิ้นต์","แตงโม","องุ่น"]},"VAZER RELOAD 15K":{"p":330,"f":["โคล่า","แตงโม","บลูเบอร์รี่","เบอร์รี่รวม","พีช","มิ้นต์เย็น","รูทเบียร์","ลิ้นจี่","ลูกอมสตรอว์เบอร์รี่","เลม่อนโซดา","สับปะรด","องุ่นเย็น","องุ่นลิ้นจี่","องุ่นโอซาก้า","แอปเปิ้ลฟูจิ"]},"หัวพอต INFY PLUS":{"p":140,"f":["โคล่า","ชามะลิ","แตงโมลิ้นจี่","แตงโมสตรอว์เบอร์รี่","น้ำส้มโซดา","บลูเบอร์รี่","พีช","มะม่วงพีช","มิ้นต์","เยลลี่องุ่น","ลิ้นจี่","ลิ้นจี่ราสเบอร์รี่","สตรอว์เบอร์รี่","สตรอว์เบอร์รี่องุ่น","สไปร์ท","หมากฝรั่งองุ่น","องุ่นกัมมี่","องุ่นเคียวโฮ","องุ่นแอปเปิ้ล","แอปเปิ้ลแดง","ไอศกรีมสตรอว์เบอร์รี่","หมากฝรั่งเปรี้ยว","แอปเปิ้ลอโล","เชอร์รี่สตรอว์เบอร์รี่","หมากฝรั่งสับปะรด","ซีซอล์ทเลม่อน","ผลไม้รวม","แตงโมราสเบอร์รี่"]},"หัวพอต MARBO ZERO":{"p":140,"f":["เกรปฟรุต","โคล่า","ชาผลไม้","ชาอู่หลง","ซิก้าร์","แตงโม","น้ำแร่","บลูเบอร์รี่","พีช","พีชสตรอว์เบอร์รี่","มะม่วง","มิกซ์เบอร์รี่","มิ้นต์","ลิ้นจี่","เลม่อน","ส้มยูสุ","สับปะรด","องุ่น","องุ่นว่านหางจระเข้","แอปเปิ้ลเขียว","โคล่า","แตงโม","เบอร์รี่ชมพู","พีชสตรอว์เบอร์รี่","มิกซ์เบอร์รี่","มิ้นต์","สตรอว์เบอร์รี่กล้วย","องุ่น","องุ่นว่านหางจระเข้","แอปเปิ้ลเขียว","มิ้นต์ฟรีซ"]},"หัวพอต RELX INFINITY":{"p":140,"f":["โคล่า","ชาเขียวมะลิ","ชาดอกชบาเย็น","ชาดำเย็น","ชาไทย","ชาพีช","ชามะนาวเย็น","ชาหลงจินเย็น","ชาอู่หลงเย็น","แตงโม","ถั่วเขียว","นํ้าส้มโซดา","น้ำเขียวโซดา","น้ำผึ้งส้มโอ","เผือก","ฝรั่ง","มะนาวเย็น","มะม่วง","เมล่อน","รูทเบียร์","ลิ้นจี่","ไวท์คอฟฟี่","สตรอว์เบอร์รี่","สไปรท์","เสาวรส","องุ่น","องุ่นเขียว","องุ่นแอปเปิ้ล","แอปเปิ้ลเขียว","แตงโม","เปปเปอร์มิ้นต์","มิกซ์เบอร์รี่","มิ้นต์เอ็กซ์ตร้า","มิ้นต์ฟรีซ","ยาสูบคลาสสิค","ยาสูบร้อน","เลม่อนมิ้นต์","สเปียร์มิ้นต์","องุ่น","แอปเปิ้ลเขียว","ซิตรัส","ยาสูบมิ้นต์","ราสเบอร์รี่มิ้นต์","ไอซ์สปาร์คกิ้ง","สตรอว์เบอร์รี่","สับปะรด"]},"หัวพอต RELX LARGE":{"p":140,"f":["ลิ้นจี่","องุ่น","องุ่นแอปเปิ้ล","แอปเปิ้ลเขียว","โคล่า","ชาหลงจิน","บลูเบอร์รี่","พีช","พีชสตรอว์เบอร์รี่"]},"หัวพอต RELX ULTRA":{"p":120,"f":["ดับเบิ้ลมิ้นต์","แตงโม","บลูเบอร์รี่","เบอร์รี่ชมพู","มะม่วงเขียว","องุ่นอโล","ดับเบิ้ลมิ้นต์","พีชสตรอว์เบอร์รี่","มิกซ์เบอร์รี่","ลิ้นจี่","สับปะรด","องุ่นอโล","แอปเปิ้ลอโล","โคล่า","เบอร์รี่ชมพู"]},"ABC 8K":{"p":250,"f":["กล้วย","ดับเบิ้ลมิ้นต์","แตงโม","น้ำแร่","บลูไอซ์","มิกซ์เบอร์รี่","ลิ้นจี่","โคล่า","สตรอว์เบอร์รี่","สับปะรด","องุ่น","องุ่นอโล"]},"CARNIVAL 20K":{"p":399,"f":["กัมมี่","โคล่า","ดับเบิ้ลมิ้นต์","แตงโมไอซ์","บลูเบอร์รี่","พีชสตรอว์เบอร์รี่","สตรอว์เบอร์รี่","ส้มโซดา","องุ่น","องุ่นลิ้นจี่","องุ่นว่านหางจระเข้","สับปะรด","ยาคูลท์","แยมสตรอว์เบอร์รี่","แยมบลูเบอร์รี่","ลิ้นจี่ไอซ์","ไอติมเผือก","ไอติมสตรอว์เบอร์รี่","เมล่อน","เรดบลู"]},"DUAL SMASH 20K":{"p":320,"f":["แตงโม","มิ้นต์","โคล่า","นมกล้วย","น้ำแร่","องุ่น","องุ่นอโล","สตรอว์เบอร์รี่","แอปเปิ้ล","ชาหลงจิน","ฮันนี่เลม่อน","ยาคูลท์"]},"ELFBAR 15K":{"p":350,"f":["องุ่นว่านหางจระเข้","บลูเบอร์รี่เย็น","องุ่นเย็น","องุ่นเยลลี่","มะม่วงเขียว","ฝรั่งเย็น","โคล่าเลม่อน","ชามะนาว","แฟนต้าลิ้นจี่","พีชเย็น","องุ่นซากุระ","สตรอว์เบอร์รี่เย็น","พีชสตรอว์เบอร์รี่","เบอร์รี่","เมล่อนแตงโม","แตงโม"]},"ESKO BAR 20K":{"p":399,"f":["โคล่า","แตงโม","แตงโมสตรอว์เบอร์รี่","บลูเบอร์รี่ไอซ์","บับเบิ้ลกัม","เบอร์รี่องุ่น","ฝรั่ง","มิกซ์เบอร์รี่","เมล่อน","สตรอว์เบอร์รี่","สตรอว์เบอร์รี่กล้วย","สตรอว์เบอร์รี่กีวี่","องุ่น","องุ่นเคียวโฮ","แอปเปิ้ลว่านหางจระเข้","ลิ้นจี่เย็น","ดับเบิ้ลมิ้นต์","กล้วยเย็น","มะม่วง","น้ำแร่","เรดเลม่อนโซดา","มิ้นต์เอ็กซ์ตร้า 5%"]},"INFY 12K":{"p":350,"f":["โคล่า","แตงโมลิ้นจี่","น้ำแร่","บลูเบอร์รี่","พีช","มิกซ์เบอร์รี่","มิกซ์สตรอว์เบอร์รี่","มิ้นต์","เมล่อน","ลิ้นจี่","ลูกอมสตรอว์เบอร์รี่","สตรอว์เบอร์รี่","สตรอว์เบอร์รี่กล้วย","สตรอว์เบอร์รี่กีวี่","สตรอว์เบอร์รี่แตงโม","องุ่นเคียวโฮ","องุ่นซากุระ","องุ่นโยโย่","องุ่นแอปเปิ้ล","ไอศกรีมสตรอว์เบอร์รี่","สตรอว์เบอร์รี่ราสเบอร์รี่","สไปร์ท","ส้มโซดา","หมากฝรั่งแตงโม","เลม่อนชมพู","ราสเบอร์รี่มัลเบอร์รี่","กัมมี่แบร์","ชาอู่หลงพีช","องุ่นหน้าร้อน","บานาน่าท๊อฟฟี่","ลิ้นจี่ราสเบอร์รี่"]},"INFY 20K":{"p":399,"f":["บลูเบอร์รี่","แตงโมลิ้นจี่","ลิ้นจี่","มิกซ์เบอร์รี่","มิ้นต์","สตรอว์เบอร์รี่กีวี่","สตรอว์เบอร์รี่แตงโม","องุ่นแอปเปิ้ล","องุ่นเคียวโฮ","องุ่นโยโย่","องุ่นลิ้นจี่","องุ่นอโล","พีช","แอปเปิ้ลอโล","สปาร์คกิ้งเลม่อน","น้ำแร่","โคล่า","สตรอว์เบอร์รี่กล้วย","เมนทอลฟรีซ","หมากฝรั่งองุ่น","หมากฝรั่งแตงโม","ชานมชาจี","ชาเขียวมัทฉะ"]},"INFY BAR 15K":{"p":299,"f":["โคล่าเลม่อน","ซีซอล์ทเลม่อน","แตงโม","แตงโมลิ้นจี่","พีชสตรอว์เบอร์รี่","บลูเบอร์รี่","แฟนต้าองุ่น","มะม่วงโยเกิร์ต","มิกซ์เบอร์รี่","มิ้นต์","เมล่อน","ลิ้นจี่","ลูกอมเปรี้ยว","สตรอว์เบอร์รี่แตงโม","องุ่นเคียวโฮ","องุ่นลิ้นจี่","มะนาว","สับปะรดมะนาว","โคล่า","องุ่นแอปเปิ้ล"]},"INFY BAR PRO 20K":{"p":399,"f":["ดับเบิ้ลมิ้นต์","บลูไอซ์","โคล่า","มิกซ์เบอร์รี่","ลูกอมเรนโบว์","เบอร์รี่ชมพู","ลิ้นจี่เย็น","แตงโม","แตงโมสตรอว์เบอร์รี่","แตงโมลิ้นจี่","หมากฝรั่งแตงโม","สตรอว์เบอร์รี่","พีชสตรอว์เบอร์รี่","สตรอว์เบอร์รี่กล้วย","สตรอว์เบอร์รี่กีวี่","องุ่น","องุ่นลิ้นจี่","องุ่นว่านหางจระเข้","แตงโมมิ้นต์","ยาคูลท์","เรดบลู","มัทฉะลาเต้","ฝรั่งเสาวรส","ราสเบอร์รี่แตงโม","ไอติมสตรอว์เบอร์รี่"]},"JOIWAY 12K":{"p":320,"f":["โคล่าเลม่อน","โคล่า","ลิ้นจี่","แตงโม","แอปเปิ้ลเขียว","แฟนต้าเขียว","เมล่อนฮอกไกโด","มิ้นต์","ส้มโซดา","บลูเบอร์รี่","องุ่น","เสาวรส","ลูกอมเรนโบว์","สตรอว์เบอร์รี่","ชามะนาว","คุกกี้"]},"JOIWAY TWINS 20K":{"p":399,"f":["โคล่า / แอปเปิ้ลเขียว","โคล่า / สตรอว์เบอร์รี่","ลิ้นจี่ / คุกกี้","ลูกอมเรนโบว์ / มิ้นต์","ลูกอมเรนโบว์ / สตรอว์เบอร์รี่","มิ้นต์ / สตรอว์เบอร์รี่","องุ่น / บลูเบอร์รี่","องุ่น / แตงโม","องุ่น / ลิ้นจี่","แอปเปิ้ลเขียว / คุกกี้","แอปเปิ้ลเขียว / สตรอว์เบอร์รี่","บลูเบอร์รี่ / แตงโม","บลูเบอร์รี่ / ลิ้นจี่","แตงโม / ลูกอมเรนโบว์","แตงโม / ลิ้นจี่","แตงโม / สตรอว์เบอร์รี่"]},"KS Quik 6K":{"p":280,"f":["โคล่าเลม่อน","ชานมอู่หลง","แตงโม","น้ำแร่","บลูเบอร์รี่","ฝรั่ง","มะนาว","มะม่วง","มิกซ์เบอร์รี่","เมนทอล","เมล่อน","ยาสูบครีม","ยาสูบคลาสสิค","ลิ้นจี่","สตรอว์เบอร์รี่","สับปะรด","องุ่น","ไอศกรีมสตรอว์เบอร์รี่"]},"LANA IRIS 24K":{"p":410,"f":["ชากวนอิน 3%","แตงโม 3%","น้ำแร่ 3%","ฝรั่ง 3%","มิกซ์เบอร์รี่ 3%","มิ้นต์ 3%","ลิ้นจี่ 3%","สตรอว์เบอร์รี่ 3%","สับปะรด 3%","ส้มองุ่น 3%","องุ่น 3%","โคล่า 3%","เลม่อนโคล่า 3%","ชากวนอิน 5%","มิ้นต์ 5%"]},"MARBO 10K":{"p":399,"f":["บลูไอซ์","เบอร์รี่ชมพู","เบอร์รี่รวม","แตงโม","แตงโมมิ้นต์","โคล่า","มัทฉะลาเต้","เมนทอล","เลม่อนมิ้นต์","สตรอว์เบอร์รี่กีวี่","องุ่น","องุ่นเคียวโฮ"]},"MARBO 9K":{"p":350,"f":["โคล่า","ดับเบิ้ลมิ้นต์","แตงโม","บลูไอซ์","เบอร์รี่ชมพู","พีช","พีชสตรอว์เบอร์รี่","แฟนต้าส้ม","มิกซ์เบอร์รี่","เยลลี่","ลูกอมเรนโบว์","สตรอว์เบอร์รี่","สปาร์คกิ้งเลม่อน","หมากฝรั่งแตงโม","องุ่น","องุ่นลิ้นจี่","องุ่นว่านหางจระเข้","แอปเปิ้ลเขียว","สตรอว์เบอร์รี่มิลค์เชค","เมนทอลฟรีส","องุ่นเคียวโฮ","แอปเปิ้ลเลม่อน","บลูเบอร์รี่มิ้นต์","สตรอว์เบอร์รี่กีวี่"]},"MARBO 9K (โคลน)":{"p":290,"f":["ดับเบิ้ลมิ้นต์","บลูไอซ์","พีช","พีชสตรอว์เบอร์รี่","มิกซ์เบอร์รี่","ลูกอมเรนโบว์","สตรอว์เบอร์รี่","สปาร์คกิ้งเลม่อน","หมากฝรั่งแตงโม","องุ่น","องุ่นลิ้นจี่","องุ่นว่านหางจระเข้","เบอร์รี่ชมพู","เยลลี่","แตงโม","แฟนต้าส้ม","แอปเปิ้ลเขียว","โคล่า","สตรอว์เบอร์รี่มิลค์เชค","เมนทอลฟรีส","องุ่นเคียวโฮ","แอปเปิ้ลเลม่อน","บลูเบอร์รี่มิ้นต์","สตรอว์เบอร์รี่กีวี่"]},"RELX DIVA 30K":{"p":490,"f":["โคล่า","ดับเบิ้ลมิ้นต์","แตงโม","น้ำแร่","น้ำส้มโซดา","มะม่วงเสาวรส","มิกซ์เบอร์รี่","เมล่อน","สเปียร์มิ้นต์","องุ่น","องุ่นอโล","ไอติมสตรอว์เบอร์รี่","กาแฟโกปิโก้","โคล่า","ดับเบิ้ลมิ้นต์","แตงโม","องุ่น"]},"RELX SMASH GO 12K":{"p":320,"f":["แอปเปิ้ล 3%","เสาวรส 3%","องุ่น 3%","องุ่นลิ้นจี่ 3%","พีชสตรอว์เบอร์รี่ 3%","มะม่วง 3%","แตงโม 3%","เบอร์รี่รวม 3%","ดับเบิ้ลมิ้นต์ 3%","โคล่า 3%","ชาอู่หลง 3%","บลูเบอร์รี่เย็น 3%","เบอร์รี่ชมพู 3%","ฝรั่ง 3%","ลิ้นจี่ 3%","สตรอว์เบอร์รี่เย็น 3%","สับปะรดเย็น 3%","องุ่นอโล 3%","หมากฝรั่งแตงโม 3%","แตงโม 5%","ดับเบิ้ลมิ้นต์ 5%","องุ่น 5%","โคล่า 5%","คูลมิ้นต์ 5%","เบอร์รี่รวม 5%","ยาสูบคลาสสิค 5%","สเปียร์มิ้นต์ 5%"]},"RELX SPARTA 20K":{"p":399,"f":["โคล่า","ชาอู่หลง","ดับเบิ้ลมิ้นต์","แตงโม","น้ำแร่","บลูเบอร์รี่","พีชสตรอเบอร์รี่","เยลลี่","รวมมิตรเบอร์รี่","ราสเบอร์รี่มิ้นติ์","ลูกกวาด","สตรอเบอร์รี่","สัปปะรด","องุ่น","องุ่นลิ้นจี่","แอปเปิ้ล","เบอร์รี่ชมพู","โพล่าร์มิ้นต์","หมากฝรั่งแตงโม","ลิ้นจี่","องุ่นอโล"]},"SONIC 8K":{"p":250,"f":["กัมมี่แบร์","โคล่า","แตงโม","น้ำแร่","มิกซ์เบอร์รี่","มิ้นต์","ยาคูลท์","สตรอว์เบอร์รี่","องุ่น","แอปเปิ้ลเขียว"]},"STAR 2,500":{"p":150,"f":["กล้วย","โคล่า","แตงโม","น้ำแร่","บลูเบอร์รี่","พีช","มะม่วง","มิกซ์เบอร์รี่","มิ้นต์","ลิ้นจี่","สตรอว์เบอร์รี่","องุ่น"]},"V PLUS 16K":{"p":370,"f":["กัมมี่แบร์","โคล่า","แตงโม","บลูเบอร์รี่","พีชสตรอว์เบอร์รี่","มิกซ์เบอร์รี่","มิ้นต์","ลิ้นจี่","ลูกอมเรนโบว์","สตรอว์เบอร์รี่","สตรอว์เบอร์รี่ราสเบอร์รี่","หมากฝรั่งแตงโม","องุ่น","องุ่นเคียวโฮ","แอปเปิ้ล","แอปเปิ้ลชิชา"]},"VOSOON 23K":{"p":399,"f":["ชาหลงจิน","แตงโม","บลูเบอร์รี่เย็น","ฝรั่งเสาวรส","พีชสตรอว์เบอร์รี่","มิ้นต์ฟรีซ","ลิ้นจี่เย็น","องุ่นเย็น","แอปเปิ้ลอโล","โคล่า"]},"ESKO BAR SWITCH 20K (KIT)":{"p":499,"f":["โคล่า","แตงโมเย็น","แตงโมเลม่อน","บลูเบอร์รี่","ฝรั่ง","มิกซ์เบอร์รี่","มิ้นต์","เมล่อน","โยเกิร์ต","ลิ้นจี่","สตรอว์เบอร์รี่","สตรอว์เบอร์รี่กล้วย","สับปะรด","องุ่น","แอปเปิ้ลอโล"]},"KS QUIK PRO 15K (KIT)":{"p":499,"f":["โคล่าเลม่อน","ชานม","แตงโม","น้ำแร่","บลูเบอร์รี่","เมนทอล","โยเกิร์ต","ลิ้นจี่","ลิ้นจี่แบล็คเคอร์แรนท์","เลม่อนโซดา","สตรอว์เบอร์รี่","สับปะรด","องุ่น","องุ่นลิ้นจี่","แอปเปิ้ลเปรี้ยว","องุ่นเบอร์รี่"]},"M SWITCH 15K (KIT)":{"p":499,"f":["ดับเบิ้ลมิ้นต์","บลูเบอร์รี่เย็น","พีชสตรอว์เบอร์รี่","มะม่วงเสาวรส","มิกซ์เบอร์รี่","สตรอว์เบอร์รี่","สตรอว์เบอร์รี่แตงโม","หมากฝรั่งแตงโม","องุ่น","องุ่นลิ้นจี่","องุ่นว่านหางจระเข้","เบอร์รี่ชมพู","แตงโม","แบล็คเบอร์รี่","แอปเปิ้ลว่านหางจระเข้","โคล่า","องุ่นเคียวโฮ"]},"VAZER RELOAD 15K (KIT)":{"p":450,"f":["โคล่า","มิ้นต์เย็น","ลูกอมสตรอว์เบอร์รี่","องุ่นเย็น","แตงโม"]},"เครื่อง DUAL SMASH":{"p":200,"f":[]},"เครื่อง ELFBAR JOINONE":{"p":349,"f":["สีเขียว","สีดำ","สีแดง","สีน้ำเงิน","สีม่วง","สีส้ม"]},"เครื่อง M SWITCH 15K":{"p":250,"f":[]},"เครื่อง M SWITCH 15K (โคลน)":{"p":200,"f":[]},"เครื่อง M ZERO NANO":{"p":690,"f":["สีดำ","สีขาว","สีชมพู","สีฟ้า"]},"เครื่อง M ZERO PRO":{"p":890,"f":["สีเขียว","สีชมพู","สีแดง","สีเงิน","สีดำ","สีเหลืองดำ","สีฟ้าม่วง","สีดำชมพู"]},"เครื่อง RELX CREATOR 20K":{"p":250,"f":["สีดำ","สีเทา-เหลือง"]},"เครื่อง RELX ESSENTIAL 2":{"p":490,"f":["สีเทา","สีดำ","สีเงิน","สีฟ้าม่วง"]},"เครื่อง RELX INFINITY 2+":{"p":990,"f":["สีเขียว","สีเงิน","สีดำ","สีเทา","สีบรอนซ์ทอง","สีโรสโกลด์","สีขาว"]},"เครื่อง VAZER RELOAD":{"p":220,"f":[]},"ไส้บุหรี่ IQOS INDO":{"p":1500,"f":["GREEN","BRIGHT WAVE","BLUE","BLACK GREEN","PURPLE WAVE","BRONZE","SIENNA","DIMENSION APRICITY","DIMENSION YUGEN","GOLDEN EDITION","RIVIERA PEARL","BERRINE EDITION","AUBURN EDITION","MULINT EDITION","SUN PEARL","BLACK RUBY","BLACK PURPLE","OASIS PEARL","BERMIN PEARL","PERINT PEARL"]},"ไส้บุหรี่ IQOS JP":{"p":2150,"f":["BALANCED REGULAR","BLACK MENTHOL","BLACK PURPLE MENTHOL","BLACK RUBY MENTHOL","FUSION MENTHOL","MENTHOL","MINT","OASIS PEARL","TROPICAL MENTHOL","PURPLE MENTHOL","REGULAR","RICH REGULAR","SMOOTH REGULAR","SUN PEARL","YELLOW MENTHOL","WARM REGULAR","BLACK FUCHSIA MENTHOL","BRIGHT MENTHOL","BLACK YELLOW MENTHOL","BLACK SUNSHINE MENTHOL","RUBY REGULAR","RIVIERA PEARL","CLEAR REGULAR","SHINE PEARL","VELVET PEARL","STARLING PEARL","STELLAR PEARL"]},"ไส้บุหรี่ IQOS MALAY":{"p":1700,"f":["ZING WAVE","TURQUOISE","RUSSET","BLUE","BLACK GREEN","PURPLE WAVE","SIENNA","OASIS PEARL","SUN PEARL","AMBER"]},"เครื่อง IQOS ILUMA I ONE":{"p":3200,"f":["สีฟ้า","สีส้ม","สีม่วง","สีดำ","สีเขียว"]},"เครื่อง IQOS ILUMA I PRIME":{"p":5200,"f":["สีดำ","สีฟ้า","สีเลือดหมู","สีเขียว","สีม่วง"]},"เครื่อง IQOS ILUMA I STANDARD":{"p":4200,"f":["สีดำ","สีฟ้า","สีเขียว","สีม่วงอ่อน","สีส้ม","สีม่วง"]},"SALTNIC ESKOLIQ 30ML":{"p":250,"f":["โคล่า","มิกซ์เบอร์รี่"]},"SALTNIC MARBO 30ML":{"p":270,"f":["เขียว","ชมพู","ดำ","ทอง","น้ำเงิน","ม่วง","เงิน","แดง","ม่วง"]},"FREEBASE ESKOLIQ 30ML":{"p":150,"f":["โคล่า","มิกซ์เบอร์รี่","ไอซ์บลาสต์"]},"FREEBASE MARBO 30ML":{"p":170,"f":["ทอง","ชมพู","ฟ้า","ม่วง"]},"FREEBASE PHATJUICE 30ML":{"p":170,"f":[]},"NICOTINE POUCH - KARDINAL POUCH":{"p":199,"f":["MANGO (3MG)","PEPPERMINT (3MG)","COLA (3MG)","BLUEBERRY CITRUS (3MG)","ICE MINT (3MG)","PEPPERMINT (6MG)","COLA (6MG)","BLUEBERRY CITRUS (6MG)","ICE MINT (6MG)","MANGO (6MG)"]},"NICOTINE POUCH - ZAR POUCH":{"p":199,"f":["FRESH MINT (3MG)","LEMON CRUSH (3MG)","COLA (3MG)","CITRUS (3MG)","WATERMELON (3MG)","FRESH MINT (6MG)","LEMON CRUSH (6MG)","COLA (6MG)","CITRUS (6MG)","WATERMELON (6MG)"]},"NICOTINE POUCH - ZYN POUCH":{"p":179,"f":["SPEARMINT (1.5MG)","PEACH (1.5MG)","COFFEE (1.5MG)","COOL MINT (3MG)","SPEARMINT (3MG)","PEACH (3MG)","COFFEE (3MG)","COOL MINT (6MG)"]}};

// 🍇 กลิ่น/สีจริงทุกรุ่น (911 SKU) — ไม่ยัดใส่ prompt ทั้งก้อน แต่แนบเฉพาะรุ่นที่ลูกค้าพูดถึง (prompt ไม่บวม + จีทูตอบกลิ่นได้แม่น)

// 🇹🇭 คำไทย/สะกดแบบลูกค้า → ชื่อรุ่นจริงในฐานกลิ่น (ให้ flavorHint จับได้แม้ลูกค้าพิมพ์ไทย)
const TH_MODEL = [
  [/เอลบา\s*ส?ว?อ?[ฟป]|สวอ[ฟป]|elf\s*bar\s*swap|elfbar\s*swap/i, "ELFBAR SWAP 25K"],
  [/เครื่อง\s*เอลบา|joinone|จอยวัน/i, "เครื่อง ELFBAR JOINONE"],
  [/เอลบา(?!\s*ส)|elfbar\s*15|เอลบาร์\s*15/i, "ELFBAR 15K"],
  [/มาโบ\s*สวิ[ชซต]|เอ็?ม\s*สวิ[ชซต]|m\s*swi[ct]?ch/i, "M SWITCH"],
  [/เอสโค่|เอสโก้|esko\s*bar\s*switch|esko\s*swi/i, "ESKO BAR SWITCH 20K"],
  [/เอสโค่\s*บาร์|esko\s*bar\s*20/i, "ESKO BAR 20K"],
  [/มาโบ\s*ซีโร่|มาโบ\s*เซโร่|marbo\s*zero|เอ็?ม\s*ซีโร่/i, "หัวพอต MARBO ZERO"],
  [/มาโบ\s*9|marbo\s*9|มาโบเก้า/i, "MARBO 9K"],
  [/มาโบ\s*10|marbo\s*10/i, "MARBO 10K"],
  [/บูสพอต|บูสท์|boost\s*pod|รีแลค\s*บูส/i, "RELX BOOST POD"],
  [/พอตคลีย|pod\s*clear|รีแลค\s*คลีย/i, "RELX POD CLEAR 18K"],
  [/รีแลค\s*อินฟิ|relx\s*infinity|อินฟินิตี้/i, "หัวพอต RELX INFINITY"],
  [/อินฟี่|infy\s*plus|อินฟี\s*พลัส/i, "หัวพอต INFY PLUS"],
  [/เลโก้|abc\s*lego/i, "ABC LEGO 20K"],
  [/แท้?งค์|abc\s*tank/i, "ABC TANK 22K"],
  [/เวเซอร์|วาเซอร์|vazer/i, "VAZER RELOAD 15K"],
  [/เคเอส|ks\s*quik\s*pro/i, "KS QUIK PRO 15K"],
  [/ดูอั?ล\s*สแมช|dual\s*smash/i, "DUAL SMASH 20K"],
  [/คาร์นิวัล|carnival/i, "CARNIVAL 20K"],
  [/ลาน่า|lana/i, "LANA IRIS 24K"],
  [/โซนิค|sonic/i, "SONIC 8K"],
  [/วีพลัส|v\s*plus/i, "V PLUS 16K"],
  [/โวซูน|vosoon/i, "VOSOON 23K"],
  [/สปาร์ต้า|sparta/i, "RELX SPARTA 20K"],
  [/ดีว่า|diva/i, "RELX DIVA 30K"],
  [/สแมชโก|smash\s*go/i, "RELX SMASH GO 12K"],
  [/จอยเวย์\s*ทวิน|joiway\s*twins/i, "JOIWAY TWINS 20K"],
  [/จอยเวย์|joiway/i, "JOIWAY 12K"],
  [/คาร์ดินอล|kardinal/i, "NICOTINE POUCH - KARDINAL POUCH"],
  [/\bzar\b|ซาร์/i, "NICOTINE POUCH - ZAR POUCH"],
  [/\bzyn\b|ซิน\b/i, "NICOTINE POUCH - ZYN POUCH"],
  [/ไอคอส|iqos|ไอ\s*คอส/i, "ไส้บุหรี่ IQOS JP"],
  [/อิลูม่า|iluma\s*i?\s*prime|ไพร์?ม/i, "เครื่อง IQOS ILUMA I PRIME"],
  [/iluma\s*i?\s*standard|สแตนดาร์ด/i, "เครื่อง IQOS ILUMA I STANDARD"],
  [/ซอลนิค|saltnic|ซอลต์นิค/i, "SALTNIC MARBO 30ML"],
  [/ฟรีเบส|freebase/i, "FREEBASE MARBO 30ML"],
  [/เอ็?ม\s*ซีโร่\s*โปร|m\s*zero\s*pro/i, "เครื่อง M ZERO PRO"],
  [/มาโบ|marbo/i, "MARBO 9K"],   // ท้ายสุด: พูด "มาโบ" ลอยๆ = MARBO 9K (ตัวขายดี)
  [/เอ็?ม\s*ซีโร่\s*นาโน|m\s*zero\s*nano/i, "เครื่อง M ZERO NANO"],
  [/ครีเอเตอร์|creator/i, "เครื่อง RELX CREATOR 20K"],
  [/เอสเซนเชียล|essential/i, "เครื่อง RELX ESSENTIAL 2"],
];

// เติมราคาจากฐานสินค้าจริงเข้า PRICE ทุกรุ่นที่ยังไม่มี (กันราคาหลุด → การ์ดขึ้น "-" แล้วยอดรวมขาด)
for (const k in FLAVORS) if (!(k in PRICE)) PRICE[k] = FLAVORS[k].p;
const FLAVOR_KEYS = Object.keys(FLAVORS).sort((a,b)=>b.length-a.length);
function normTH(s){ return String(s||"").toUpperCase().replace(/[\s\-_.]/g,""); }
// sm = stockmap (ถ้ามี) → บอกไปเลยว่ากลิ่นไหนมี กลิ่นไหนหมด จีทูจะได้ไม่ลิสต์กลิ่นที่หมดให้ลูกค้า
function flavorHint(text, sm, buf){
  const t = normTH(text);
  const hits = [];
  const add = (k) => { if (k && FLAVORS[k] && hits.indexOf(k) === -1 && hits.length < 3) hits.push(k); };
  for (const [re, key] of TH_MODEL) if (re.test(String(text||""))) add(key);   // คำไทย/สะกดแบบลูกค้า
  for (const k of FLAVOR_KEYS) { if (hits.length >= 3) break; if (t.indexOf(normTH(k)) !== -1) add(k); } // ชื่อรุ่นตรงๆ
  if (!hits.length) return "";
  const B = (typeof buf === "number") ? buf : 1;
  const qtyOf = (model, flavor) => {
    if (!sm) return null;
    try { return findStockForItem(sm, model, flavor); } catch (e) { return null; }
  };
  let out = "\n\n[ข้อมูลกลิ่น+สต็อกจากระบบ — ห้ามบอกลูกค้าว่าได้มาจากไหน ใช้ตอบได้เลย]";
  for (const k of hits){
    const v = FLAVORS[k];
    if (!v.f.length) { out += "\n• " + k + " (" + v.p + " บาท) — ไม่มีตัวเลือกกลิ่น/สี"; continue; }
    const have = [], gone = [];
    for (const f of v.f) { const q = qtyOf(k, f); if (q !== null && q <= B) gone.push(f); else have.push(f); }
    out += "\n• " + k + " (" + v.p + " บาท)";
    out += "\n   ✅ มีของ: " + (have.length ? have.join(" · ") : "— หมดทุกกลิ่น —");
    if (gone.length) out += "\n   ❌ หมด: " + gone.join(" · ");
  }
  out += "\n⛔ เวลาลิสต์กลิ่นให้ลูกค้า ให้บอกเฉพาะกลิ่นในบรรทัด ✅ มีของ เท่านั้น ห้ามเอากลิ่นในบรรทัด ❌ หมด ไปเสนอเด็ดขาด";
  out += "\n⛔ ถ้ารุ่นนั้นหมดทุกกลิ่น ให้บอกตรงๆ ว่าหมดชั่วคราว แล้วเสนอรุ่นอื่นแทน ห้ามลิสต์กลิ่นออกมา";
  out += "\n⛔ ห้ามแต่งชื่อกลิ่นที่ไม่มีในลิสต์นี้ และห้ามบอกจำนวนสต็อกเป็นตัวเลข";
  return out;
}


// ===== 🌏 รองรับลูกค้าต่างชาติ (ไทย / อังกฤษ / จีน / ญี่ปุ่น) =====
// ตรวจภาษาจากตัวอักษรที่ลูกค้าพิมพ์ แล้วจำไว้ทั้งบทสนทนา (คนไทยไม่กระทบเลย)
function detectLang(t) {
  const s = String(t || "");
  if (/[\u0E00-\u0E7F]/.test(s)) return "th";                     // ไทย
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(s)) return "ja";       // ฮิระงะนะ/คาตากานะ = ญี่ปุ่น
  if (/[\u4E00-\u9FFF]/.test(s)) return "zh";                     // ตัวจีน
  if (/[A-Za-z]{3,}/.test(s)) return "en";                          // อังกฤษ
  return "";                                                        // อ่านไม่ออก (ตัวเลข/อิโมจิ) = ไม่เปลี่ยนภาษา
}
const LANG_NAME = { th: "ภาษาไทย", en: "English", zh: "中文（简体）", ja: "日本語" };
const T = {
  askItem: {
    en: "Which model, flavor and how many would you like? 💕",
    zh: "请问您需要哪个型号、什么口味、要几个呢？💕",
    ja: "どのモデル・フレーバー・数量をご希望でしょうか？💕"
  },
  outStock: {
    en: (m, f) => "Sorry 🙏🏻 " + m + " (" + f + ") is temporarily out of stock.\nWould you like to choose another flavor, or shall our admin suggest one that's available? 💕",
    zh: (m, f) => "抱歉 🙏🏻 " + m + "（" + f + "）目前暂时缺货。\n您要换其他口味吗？或者由客服为您推荐有货的口味？💕",
    ja: (m, f) => "申し訳ございません 🙏🏻 " + m + "（" + f + "）は現在品切れです。\n他のフレーバーをお選びいただくか、在庫のあるものをご案内しましょうか？💕"
  },
  addrForm: {
    en: "\n\nPlease send your delivery details 📍\nName:\nAddress:\nDistrict / City:\nProvince:\nPostcode:\nPhone:\nThank you 🙏🏻💕",
    zh: "\n\n请提供收件信息 📍\n收件人：\n详细地址：\n区/市：\n府/省：\n邮编：\n电话：\n谢谢您 🙏🏻💕",
    ja: "\n\nお届け先をお送りください 📍\nお名前：\nご住所：\n市区町村：\n県：\n郵便番号：\nお電話番号：\nよろしくお願いします 🙏🏻💕"
  },
  waitAdmin: {
    en: "One moment please 🙏🏻 Our admin will take care of you shortly 💕",
    zh: "请稍等 🙏🏻 客服马上为您服务 💕",
    ja: "少々お待ちください 🙏🏻 担当スタッフがすぐにご案内いたします 💕"
  },
  checkStock: {
    en: "Let me check the stock for you first 🙏🏻 Our admin will confirm and finalize your order right away 💕",
    zh: "我先为您确认库存 🙏🏻 客服确认后马上为您整理订单 💕",
    ja: "在庫を確認いたします 🙏🏻 スタッフが確認後、すぐにご注文をまとめます 💕"
  },
  reAsk: {
    en: "Could you confirm again please 🙏🏻 — model + flavor + quantity. I'll prepare the correct order for you 💕",
    zh: "麻烦您再确认一次 🙏🏻 —— 型号 + 口味 + 数量，我马上为您整理订单 💕",
    ja: "もう一度ご確認ください 🙏🏻 — モデル・フレーバー・数量 を教えてください 💕"
  }
};
function L(key, lang, a, b) {
  const v = T[key] && T[key][lang];
  if (!v) return null;                      // ไทย (หรือไม่มีคำแปล) = ใช้ข้อความไทยเดิม
  return typeof v === "function" ? v(a, b) : v;
}

const PRICE_KEYS = Object.keys(PRICE).sort((a, b) => b.length - a.length); // ยาวก่อน กันจับคู่ผิด

// ── สแลง/คำสะกดไทย → รุ่นจริง (ใบ้ให้ AI ตรงรุ่น กันเดาเป็น MARBO 9K) ──
const ALIAS = [
  [/เอลบา\s*ส?ว?อ?ฟ|เอลบาร์\s*สวอ?ป?|สวอฟ|สวอป|elf\s*bar\s*swap|elfbar\s*swap|\bswap\b/i, "ELFBAR SWAP 25K (หัว Big Pod ของค่าย ELFBAR ราคา 350)"],
  [/เอลบา|เอลบาร์|เอลฟ์?บาร์?|elf\s*bar|elfbar|joinone|จอยวัน/i, "ค่าย ELFBAR — ร้านมี: หัว ELFBAR SWAP 25K (350) + เครื่อง ELFBAR JOINONE (349, เครื่องมีแต่ 'สี' ไม่มีกลิ่น) ⛔ ไม่ใช่ MARBO"],
  [/มาโบ\s*สวิ[ชซ]|มาโบ\s*สวิต|เอ็ม\s*สวิ[ชซ]|m\s*swi[ct]?ch|m\s*swich/i, "M SWITCH (หัว 350 / เครื่อง M SWITCH 15K = 250 / KIT 499) — ไม่ใช่ MARBO 9K"],
  [/เอสโค่|เอสโก้|esko/i, "ESKO BAR SWITCH (หัว 350 / KIT เครื่อง+หัว 499 — ไม่มีเครื่องเปล่าแยก)"],
  [/มาโบ\s*ซีโร่|มาโบ\s*เซโร่|marbo\s*zero|เอ็ม\s*ซีโร่|m\s*zero/i, "MARBO ZERO (หัวเล็ก 140) / เครื่อง M ZERO PRO 890 / M ZERO NANO 690"],
  [/รีแลค|รีแล็ก|relx/i, "RELX (ค่าย) — หัวเล็ก RELX INFINITY 140 / Big Pod RELX POD CLEAR 390, BOOST POD 350 / เครื่อง INFINITY 2+ 990, ESSENTIAL 2 490, CREATOR 20K 250"],
  [/เวเซอร์|วาเซอร์|vazer/i, "VAZER RELOAD 15K (หัว) / เครื่อง VAZER RELOAD 220"],
  [/ดูอั?ล\s*สแมช|dual\s*smash/i, "DUAL SMASH 20K (หัว) / เครื่อง DUAL SMASH 200"],
  [/เลโก้|lego/i, "หัวแบบเติมน้ำยาเอง 3 ตัว: RELX BOOST POD 350 / ABC LEGO 20K 299 / RELX POD CLEAR 18K 390"],
];
function aliasHint(text) {
  const t = String(text || "");
  const hits = [];
  for (const [re, note] of ALIAS) if (re.test(t)) hits.push(note);
  if (!hits.length) return "";
  return "\n\n[ระบบใบ้ให้ — ห้ามพูดถึงข้อความนี้กับลูกค้า] คำที่ลูกค้าพิมพ์หมายถึง: " + hits.join(" | ") + "\n⛔ ห้ามตอบเป็นรุ่นอื่นที่ไม่ตรงกับนี้";
}
function findPrice(modelText) {
  const t = (modelText || "").toUpperCase();
  for (const k of PRICE_KEYS) if (t.indexOf(k.toUpperCase()) !== -1) return { key: k, price: PRICE[k] };
  return null;
}
// หัวน้ำยาใหญ่ Big Pod (โปร 4 ชิ้นส่งฟรี) | หัวน้ำยาเล็ก (โปร 10 หัวส่งฟรี)
const BIGPOD = ["RELX BOOST POD", "RELX POD CLEAR 18K", "ELFBAR SWAP 25K", "ESKO BAR SWITCH 20K", "KS QUIK PRO 15K", "M SWITCH", "VAZER RELOAD 15K", "ABC TANK 22K", "ABC TANK", "ABC LEGO 20K", "ABC LEGO"];
const SMALLPOD = ["INFY PLUS", "MARBO ZERO", "RELX INFINITY", "RELX LARGE", "RELX ULTRA"];
function catOf(key) {
  if (/POUCH|SALTNIC|FREEBASE|IQOS|ไส้บุหรี่/i.test(key)) return "other"; // ไม่เข้าโปรส่งฟรีของพอต
  if (/^เครื่อง/.test(key)) return "device";
  if (/\(KIT\)/.test(key)) return "bigpod";          // ชุด KIT นับรวมกับ Big Pod (4 ชิ้นส่งฟรี)
  if (BIGPOD.indexOf(key) !== -1) return "bigpod";     // หัวน้ำยาใหญ่ Big Pod → 4 ชิ้นส่งฟรี
  if (SMALLPOD.indexOf(key) !== -1) return "smallpod"; // หัวน้ำยาเล็ก → 10 หัวส่งฟรี
  return "disp"; // พอตใช้แล้วทิ้ง → 4 แท่งส่งฟรี
}
function cloneTier(n) { return n >= 1000 ? 190 : n >= 500 ? 200 : n >= 300 ? 210 : n >= 200 ? 220 : n >= 100 ? 230 : n >= 50 ? 240 : n >= 20 ? 250 : 290; }
// แยกรายการจากบล็อก "ทวนคำสั่งซื้อ" (รูปแบบบรรทัด: รุ่น | กลิ่น | จำนวน)
function parseItems(reply) {
  const items = [];
  for (const raw of reply.split("\n")) {
    const ln = raw.trim();
    if (ln.indexOf("|") === -1) continue;
    const parts = ln.replace(/^[-•●]\s*/, "").split("|").map(s => s.trim());
    if (parts.length < 2) continue;
    const model = parts[0];
    const flavor = parts.length >= 3 ? parts[1] : "";
    const qty = parseInt((parts[parts.length - 1].match(/\d+/) || ["0"])[0], 10);
    if (!model || !qty) continue;
    items.push({ model, flavor, qty });
  }
  return items;
}
// คิดเงินจากรายการ → ราคาต่อชิ้น + ยอดรวม + ค่าส่ง (โปรส่งฟรี/เรทขายส่ง/ส่งด่วน)
// expressFee != null → ลูกค้าเลือกส่งด่วน ใช้ค่าส่งด่วนแทน (ไม่เข้าโปรส่งฟรี)
function computeOrder(items, expressFee) {
  let cloneQty = 0;
  for (const it of items) { const p = findPrice(it.model); if (p && p.key === "MARBO 9K (โคลน)") cloneQty += it.qty; }
  let goods = 0, disp = 0, small = 0, big = 0; const rows = [];
  for (const it of items) {
    const isFree = /แถม|ฟรี|free/i.test(it.flavor || "") || /แถม|\(ฟรี\)/.test(it.model || "");
    const p = findPrice(it.model);
    let unit = p ? p.price : 0;
    const key = p ? p.key : it.model;
    if (p && p.key === "MARBO 9K (โคลน)" && cloneQty >= 20) unit = cloneTier(cloneQty);
    if (isFree) unit = 0;
    const line = unit * it.qty;
    goods += line;
    if (!isFree) { const c = p ? catOf(p.key) : "disp"; if (c === "disp") disp += it.qty; else if (c === "smallpod") small += it.qty; else if (c === "bigpod") big += it.qty; }
    const label = (key.replace(/^เครื่อง /, "")) + (it.flavor ? " " + it.flavor : "") + (isFree ? "" : " x" + it.qty) + (isFree ? " (แถมฟรี 🎁)" : "");
    rows.push({ label, line, unknown: !p, free: isFree });
  }
  // 🎁 ของแถมอัตโนมัติ: Big Pod (หัวน้ำยาใหญ่) ครบ 5 หัว → แถมเครื่องเปล่า 1 เครื่อง (มูลค่า 250)
  if (big >= 5 && !rows.some(r => r.free && /เครื่อง/.test(r.label)))
    rows.push({ label: "เครื่องเปล่า (แถมฟรี 🎁 มูลค่า 250)", line: 0, free: true });
  if (expressFee != null) {
    // ส่งด่วน: ใช้ค่าส่งด่วนตามระยะทาง (ไม่เข้าโปรส่งฟรีพัสดุ)
    return { rows, goods, ship: expressFee, total: goods + expressFee, freeShip: false, express: true };
  }
  // 🎁 ออเดอร์ที่ใช้ "โปรแถมสินค้า" (มีของแถมในบิล) = ไม่เข้าโปรส่งฟรี ต้องจ่ายค่าส่ง 40 ตามปกติ
  const hasGift = rows.some(r => r.free);
  const freeShip = !hasGift && (disp >= 4 || small >= 10 || big >= 4 || cloneQty >= 20);
  const ship = freeShip ? 0 : 40;
  return { rows, goods, ship, total: goods + ship, freeShip, express: false, gift: hasGift };
}

// เช็คสต็อกของ 1 รายการ (รุ่น+กลิ่น) จาก stockmap → คืนจำนวนคงเหลือ (null = หาไม่เจอ ข้ามการเช็ค)
// คืน max ของรายการที่แมตช์ (ถ้ามีกลิ่นใกล้เคียงที่ยังมีของ = ไม่บล็อก กันบล็อกผิด)
// 🎯 แบบให้คะแนน (v2) — เลือก "คีย์ที่ตรงที่สุด" ไม่ใช่ "คีย์ที่ของเยอะสุด"
// ของเดิมใช้ max จึงเกิดอาการ "ของหมดบอกมี": เช่น ถาม ELFBAR SWAP องุ่น (0 ชิ้น)
// แต่ไปเจอ "สตรอว์เบอร์รี่องุ่นแอปเปิ้ล 88 ชิ้น" แล้วตอบว่ามี
// v2 แยกให้ขาด: กลิ่นตรงเป๊ะ > กลิ่นขึ้นต้น/ลงท้าย > กลิ่นเป็นส่วนหนึ่ง
//              รุ่นตรงเป๊ะ > ครบทุกคำ > ครึ่งหนึ่ง  และหักคะแนนแรงถ้า KIT/โคลน/หัวน้ำยา หรือเลข K ไม่ตรง
// ทดสอบกับ 569 กลิ่นที่มี SKU ตรงเป๊ะ: ถูก 100% (ของเดิม 78.7%)
// 🔀 ชื่อรุ่นใน XSelly ไม่ตรงกับชื่อที่ลูกค้า/จีทูใช้ — แปลงก่อนค้นสต็อก
// (ไส้บุหรี่ IQOS ในระบบคลังใช้ชื่อแบรนด์จริงคือ TEREA + รหัสประเทศ)
const STOCK_MODEL_ALIAS = {
  "ไส้บุหรี่ iqos indo": "TEREA IN",
  "ไส้บุหรี่ iqos jp": "TEREA JP",
  "ไส้บุหรี่ iqos malay": "TEREA MY",
  "iqos indo": "TEREA IN",
  "iqos jp": "TEREA JP",
  "iqos malay": "TEREA MY",
  "terea indo": "TEREA IN",
  "terea malay": "TEREA MY"
};
let _stkIdx = null, _stkRef = null;
function findStockForItem(sm, model, flavor) {
  if (!flavor) return null;
  { const a = STOCK_MODEL_ALIAS[String(model || "").trim().toLowerCase()]; if (a) model = a; }
  const nF = (s) => (s || "").toLowerCase().replace(/[\s%()\-]|ml/g, "");
  const nM = (s) => (s || "").toLowerCase().replace(/[\s%()\-]/g, "");
  const toks = (s) => (s || "").toLowerCase().split(/[^a-z0-9ก-๙]+/).filter(w => w.length >= 2);
  const rate = (s) => { const m = String(s).match(/(\d+)\s*k/i); return m ? m[1] : ""; };
  const qual = (s) => (/\bkit\b|คิท/i.test(s) ? 1 : 0) + (/โคลน|clone/i.test(s) ? 2 : 0) + (/หัวน้ำยา|หัวพอต/.test(s) ? 4 : 0);
  if (_stkRef !== sm) {   // ทำดัชนีครั้งเดียวต่อ 1 รอบข้อความ
    _stkRef = sm;
    _stkIdx = Object.keys(sm).map(k => {
      const i = k.indexOf(" - ");
      const km = i > 0 ? k.slice(0, i) : k, kf = i > 0 ? k.slice(i + 3) : "";
      return { q: sm[k] > 0 ? sm[k] : 0, nm: nM(km), nf: nF(kf), kt: toks(km), ql: qual(km), rt: rate(km) };
    });
  }
  const nf = nF(flavor); if (nf.length < 2) return null;
  const nm = nM(model), mt = toks(model), mq = qual(model), mr = rate(model);
  let best = null, bs = -1;
  for (const c of _stkIdx) {
    let fs;
    if (c.nf === nf) fs = 6;
    else if (c.nf.startsWith(nf) || c.nf.endsWith(nf)) fs = 3;
    else if (c.nf.indexOf(nf) !== -1) fs = 1;
    else continue;
    let ms;
    if (c.nm === nm) ms = 6;
    else {
      let h = 0; for (const t of mt) if (c.kt.indexOf(t) !== -1) h++;
      if (!mt.length) ms = 1;
      else if (h === mt.length) ms = 4;
      else if (h >= Math.ceil(mt.length / 2)) ms = 2;
      else if (h > 0) ms = 1;
      else continue;
    }
    const rp = (mr && c.rt && mr !== c.rt) ? 1 : 0;          // เลข K ไม่ตรง = คนละรุ่น
    const pen = ((c.ql !== mq) ? (((c.ql & 3) !== (mq & 3)) ? 5 : 2) : 0) + rp * 6;
    const sc = ms * 10 + fs - pen * 8;
    if (sc > bs || (sc === bs && best !== null && c.q > best)) { bs = sc; best = c.q; }
  }
  return best;
}

// 🩹 แก้ SKU ใหม่ที่ยังไม่มีในตารางชื่อ (skumap) — ฝังในโค้ด ไม่ต้อง re-seed
// พอมีสินค้าใหม่แล้วจีทูเห็นเป็นรหัสดิบ ให้เพิ่มคู่ "รหัส SKU": "ชื่อรุ่น - กลิ่น" ที่นี่
const SKU_FIX = {
  "EL-DP-IK-30-03-001": "ELFBAR ICE KING 30K - แคนตาลูปเย็น",
  "EL-DP-IK-30-03-002": "ELFBAR ICE KING 30K - โคล่าเลม่อนเย็น",
  "EL-DP-IK-30-03-003": "ELFBAR ICE KING 30K - แตงโมเย็น",
  "EL-DP-IK-30-03-004": "ELFBAR ICE KING 30K - สตรอว์เบอร์รี่กล้วย",
  "EL-DP-IK-30-03-005": "ELFBAR ICE KING 30K - สตรอว์เบอร์รี่เย็น",
  "EL-DP-IK-30-03-006": "ELFBAR ICE KING 30K - บลูเบอร์รี่เย็น",
  "EL-DP-IK-30-03-007": "ELFBAR ICE KING 30K - เบอร์รี่เย็น",
  "EL-DP-IK-30-03-008": "ELFBAR ICE KING 30K - พีชเย็น",
  "EL-DP-IK-30-03-009": "ELFBAR ICE KING 30K - ฝรั่ง",
  "EL-DP-IK-30-03-010": "ELFBAR ICE KING 30K - มิ้นต์เย็น",
  "EL-DP-IK-30-03-011": "ELFBAR ICE KING 30K - ลิ้นจี่เย็น",
  "EL-DP-IK-30-03-012": "ELFBAR ICE KING 30K - องุ่นเขียว",
  "EL-DP-IK-30-03-013": "ELFBAR ICE KING 30K - องุ่นเย็น",
  "IN-DP-00-20-03-022": "INFY 20K - ชานมชาจี",
  "IN-DP-00-20-03-023": "INFY 20K - ชาเขียวมัทฉะ",
  "KD-PO-00-00-03-001": "KARDINAL POUCH - MANGO (3MG)",
  "MB-KI-SW-15-00-017": "เครื่อง M SWITCH KIT - องุ่นเคียวโฮ"
};
// เปลี่ยนคีย์รหัสดิบใน stockmap เป็นชื่อจริง (ใช้ตอนอ่านสต็อก)
function fixStockNames(sm) {
  for (const k in SKU_FIX) { if (k in sm) { sm[SKU_FIX[k]] = sm[k]; delete sm[k]; } }
  return sm;
}
const SHIP_MSG = "รูปแบบการจัดส่งของร้าน ABC 🚚\n\n📦 ขนส่งเอกชน (พัสดุปกติ)\n• ค่าส่ง 40 บาท ทั่วประเทศ\n• ได้รับภายใน 2-3 วัน\n• 🎁 เข้าโปร (เช่น สูบทิ้ง 4 แท่ง) ส่งฟรี!\n\n🛵 ส่งด่วน\n• เฉพาะ กทม. และปริมณฑล\n• ค่าส่งตามระยะทาง (แชร์โลเคชั่นให้แอดมินเช็คราคาค่ะ)\n• ได้รับภายใน 1-3 ชม.\n\nสนใจสั่งสินค้าหรือรับแบบไหน แจ้งแอดมินได้เลยนะคะ 💕";
// 📍 ค่าส่งด่วนตามระยะทาง (สูตรเดียวกับมินิแอพ) — ร้านอยู่ BTS สุรศักดิ์
const SHOP_LOC = { lat: 13.7196, lng: 100.5215 };
const RIDER_BASE = 20, RIDER_PER_KM = 7, ROAD_FACTOR = 1.3, RIDER_SURCHARGE = 10;
function distKm(a1, o1, a2, o2) {
  const R = 6371, dA = (a2 - a1) * Math.PI / 180, dO = (o2 - o1) * Math.PI / 180;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function riderFee(lat, lng) {
  const km = distKm(SHOP_LOC.lat, SHOP_LOC.lng, lat, lng) * ROAD_FACTOR;
  const fee = Math.max(RIDER_BASE, Math.round((RIDER_BASE + km * RIDER_PER_KM) / 5) * 5) + RIDER_SURCHARGE;
  return { km: Math.round(km * 10) / 10, fee };
}
// ดึงพิกัด lat,lng จากข้อความลิงก์ Google Maps (หลายรูปแบบ)
function extractLatLng(s0) {
  if (!s0) return null;
  let s = s0;
  try { const d = decodeURIComponent(s0); if (d !== s0) s = s0 + " " + d; } catch (e) {} // เผื่อพิกัดถูกเข้ารหัสใน URL (หน้า consent)
  const pats = [/@(-?\d{1,2}\.\d{2,}),(-?\d{2,3}\.\d{2,})/, /!3d(-?\d{1,2}\.\d{2,})!4d(-?\d{2,3}\.\d{2,})/, /[?&](?:q|ll|daddr|destination|sll)=(-?\d{1,2}\.\d{2,}),(-?\d{2,3}\.\d{2,})/, /[?&]center=(-?\d{1,2}\.\d{2,}),(-?\d{2,3}\.\d{2,})/, /(-?\d{1,2}\.\d{4,}),\s*(-?\d{2,3}\.\d{4,})/];
  for (const p of pats) { const m = s.match(p); if (m) { const la = +m[1], lo = +m[2]; if (la >= 5 && la <= 21 && lo >= 96 && lo <= 106) return { lat: la, lng: lo }; } }
  // ลิงก์แบบเส้นทาง (dir) เก็บพิกัดเป็น !1d<lng>!2d<lat> (สลับ) — ดึงเลข !Nd ทั้งหมดแล้วแยกด้วยช่วงพิกัดไทย
  const dd = [...s.matchAll(/!\dd(-?\d{1,3}\.\d{3,})/g)].map(m => +m[1]);
  let lat = null, lng = null;
  for (const v of dd) { if (v >= 5 && v <= 21 && lat == null) lat = v; else if (v >= 96 && v <= 106 && lng == null) lng = v; }
  if (lat != null && lng != null) return { lat, lng };
  return null;
}
// แปลงลิงก์แผนที่ (รวมลิงก์ย่อ goo.gl / ลิงก์ไม่มี https://) → พิกัด
async function resolveMapLink(text) {
  const um = text.match(/(?:https?:\/\/)?[^\s]*(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)[^\s]*/i);
  if (!um) return extractLatLng(text);
  let ll = extractLatLng(um[0]);
  if (ll) return ll;
  let url = um[0]; if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  // ลองหลาย User-Agent — bot crawler มักได้หน้าเต็มโดยไม่โดน consent (วิธีเดียวกับที่ LINE ดึง preview)
  const UAS = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  ];
  for (const ua of UAS) {
    try {
      let cur = url;
      for (let hop = 0; hop < 6; hop++) {
        const r = await fetch(cur, { redirect: "manual", headers: { "User-Agent": ua, "Accept-Language": "th,en" }, signal: AbortSignal.timeout(6000) });
        const loc = r.headers.get("location");
        if (loc) { ll = extractLatLng(loc); if (ll) return ll; if (!/^https?:/i.test(loc) || /consent\.google/.test(loc)) break; cur = loc; continue; }
        ll = extractLatLng(r.url || cur); if (ll) return ll;
        const body = await r.text();
        ll = extractLatLng(body);
        if (ll) return ll;
        const bm = body.match(/\[null,null,(-?\d{1,2}\.\d{4,}),(-?\d{2,3}\.\d{4,})\]/) || body.match(/"latitude":(-?\d{1,2}\.\d{3,})[,}].*?"longitude":(-?\d{2,3}\.\d{3,})/) || body.match(/center=(-?\d{1,2}\.\d{3,})%2C(-?\d{2,3}\.\d{3,})/);
        if (bm && +bm[1] >= 5 && +bm[1] <= 21 && +bm[2] >= 96 && +bm[2] <= 106) return { lat: +bm[1], lng: +bm[2] };
        break;
      }
    } catch (e) { console.log("MAP_RESOLVE_ERR(" + ua.slice(0, 10) + ") " + String(e).slice(0, 60)); }
  }
  return null;
}
const EXPRESS_MSG = "อนุญาตแจ้งรอบส่งด่วนนะคะ 💕\nรอบส่งนับจากเวลาที่ลูกค้าชำระเงิน + ลงออเดอร์เรียบร้อยค่ะ 💲\n\n08.00 - 10.30 → รอบส่งออก 11.30 น.\n11.00 - 11.30 → รอบส่งออก 12.30 น.\n12.00 - 12.30 → รอบส่งออก 13.30 น.\n13.00 - 13.30 → รอบส่งออก 14.30 น.\n14.00 - 14.30 → รอบส่งออก 15.30 น.\n15.00 - 15.30 → รอบส่งออก 16.30 น.\n16.00 - 16.30 → รอบส่งออก 17.30 น.\n17.00 - 17.30 → รอบส่งออก 18.30 น.\n18.00 - 18.30 → รอบส่งออก 19.30 น.\n19.00 - 19.30 → รอบส่งออก 20.30 น.\n20.00 - 20.45 → รอบส่งออก 21.30 น.\nหลัง 20.45 น. → รอบส่งออก 10.30 น. (วันถัดไป)\n\nนับจากรอบส่งออก รอรับสินค้าประมาณ 3-5 ชม. จะได้รับพัสดุค่ะ (เป็นการประมาณเวลาเท่านั้น)\n❌ หากไม่สะดวกรับสาย รบกวนแจ้งสถานที่วางสินค้าล่วงหน้านะคะ\n❌ เมื่อไรเดอร์ถึงปลายทางแล้วติดต่อลูกค้าไม่ได้ภายใน 15 นาที สินค้าจะถูกตีกลับค่ะ 🙏🏻";

// ===== บุคลิก + คู่มือตอบ (กลั่นจากแชทจริงของร้าน) + ความรู้สินค้า =====
const SYSTEM_PROMPT = `คุณคือ "แอดมินร้าน ABC" ผู้หญิง บุคลิกสุภาพ ทางการ เรียบร้อย น่าเชื่อถือ ตอบลูกค้าทางแชท LINE ให้เหมือนแอดมินจริงของร้าน

# โทนการพูด
- ลงท้าย "ค่ะ/นะคะ" เสมอ สุภาพ อบอุ่น ใช้อีโมจิพอประมาณ (💕 🙏🏻 ✨ 🛵) ไม่พร่ำเพรื่อ
- ตอบสั้น กระชับ อ่านง่าย ตอบทีละสเต็ป ไม่ยัดข้อมูลทีเดียวเยอะ
- ⛔ ห้ามใช้เครื่องหมาย markdown เด็ดขาด (ห้ามใช้ ** ทำตัวหนา, ห้ามใช้ * # _ \` หน้า-หลังคำ) เพราะ LINE แสดงเป็นสัญลักษณ์ดิบๆ ดูรก ให้พิมพ์เป็นข้อความธรรมดาเท่านั้น เน้นได้แค่ใช้ขึ้นบรรทัดใหม่หรืออีโมจิ
- อย่าขึ้นต้นด้วย "ขอโทษ/ขออภัย" ถ้าไม่ได้มีอะไรผิดจริง (เช่น ของมีสต็อกอยู่แล้ว ไม่ต้องขอโทษ) — ใช้เมื่อของหมด/มีปัญหาเท่านั้น
- ถ้าลูกค้าเลือกรุ่น+กลิ่นชัดเจนแล้ว ไม่ต้องเสนอลิสต์กลิ่นอื่นซ้ำ ให้เดินหน้าปิดการขายเลย (เสนอกลิ่นอื่นเฉพาะตอนที่กลิ่นที่ลูกค้าอยากได้หมดเท่านั้น)
- ทักทายครั้งแรก: "ABC ยินดีต้อนรับค่ะ ✨ แอดมินยินดีให้บริการค่ะ 💚"

# หน้าที่
1) ตอบคำถามสินค้า/ราคา/โปร/การจัดส่ง
2) แนะนำสินค้าให้เหมาะกับลูกค้า (เช่น ถามว่าชอบสูบแบบไหน งบเท่าไหร่)
3) รับออเดอร์ตามลำดับ: (1) เก็บ รุ่น+กลิ่น/สี+จำนวน → (2) สรุปยอด+แจ้งเลขบัญชี ให้ลูกค้าโอน+ส่งสลิป → (3) พอสลิปผ่านแล้วค่อยขอที่อยู่ → (4) สรุปออเดอร์ให้แอดมิน

# เมนูสินค้า (สำคัญมาก)
เมื่อลูกค้าถามกว้างๆ ว่ามีสินค้าอะไรบ้าง / ขอดูเมนู / มีพอตอะไรบ้าง / มีกลิ่นอะไรบ้าง / ขอรายการสินค้า ให้ตอบด้วยข้อความนี้ทันที (ตอบแบบนี้เป๊ะ):
"เมนูสินค้า
ต้องการสั่งซื้อสินค้า สามารถดูเมนูจากลิงก์นี้ได้เลยค่ะ 💕
https://cutt.ly/abc-menu"
แต่ถ้าลูกค้าถามเจาะจงรุ่น/ราคา (เช่น "MARBO 9K เท่าไหร่") ให้ตอบราคาจากรายการสินค้าได้เลย ไม่ต้องส่งลิงก์

# คำที่ลูกค้าเรียก (สแลง) → รุ่นที่หมายถึง (สำคัญ อย่าตอบตัวเดียวถ้าคำนั้นหมายถึงหลายรุ่น)
- "หัวเลโก้" / "เลโก้" / "หัวแบบเติม" / "หัวเติมน้ำยา" / "หัวเติมเอง" = หัวพอตแบบเติมน้ำยาเอง (refillable) — ร้านมี 3 ตัว: (1) RELX BOOST POD = 350 บาท (2) ABC LEGO 20K = 299 บาท (3) RELX POD CLEAR 18K = 390 บาท → เวลาลูกค้าถามหัวเลโก้/หัวเติม ให้เสนอทั้ง 3 ตัวนี้พร้อมราคา แล้วถามว่าสนใจตัวไหน ⛔ ห้ามตอบแค่ ABC LEGO ตัวเดียว
- "หัวพอต" เฉยๆ (ไม่ระบุรุ่น) = ถามต่อว่าลูกค้าหมายถึงหัวของเครื่องรุ่นไหนคะ (RELX / INFY / MARBO ฯลฯ)
- "มาโบสวิช" / "มาโบสวิต" / "m swich" / "เอ็มสวิช" = M SWITCH (หัว 350 / เครื่อง 250 / KIT 499) — คนละตัวกับ MARBO 9K
- "เอสโค่สวิต" / "esko swict" = ESKO BAR SWITCH (หัว 350 / KIT 499 — ไม่มีเครื่องเปล่าแยก)
- "เอลบาร์" / "เอลบา" / "เอลฟ์บาร์" / "elfbar" / "elf bar" = ELFBAR (แบรนด์) → ร้านมี: หัว ELFBAR SWAP 25K + เครื่อง ELFBAR JOINONE
- "เอลบาสวอฟ" / "เอลบา สวอฟ" / "สวอฟ" / "สวอป" / "swap" / "elfbar swap" = ELFBAR SWAP 25K (หัว) ⛔ ห้ามตอบ MARBO 9K เด็ดขาด
- "มาโบ" / "marbo" เฉยๆ = อาจหมายถึงหลายตัว: MARBO 9K (พอตใช้แล้วทิ้ง) / MARBO ZERO (หัวเล็ก) / M SWITCH / M ZERO PRO (เครื่อง) → ถ้าไม่ชัดให้ถามก่อนว่าหมายถึงตัวไหน
- "เครื่องมาโบ" = เครื่องของค่าย MARBO → ถามว่าใช้กับหัวรุ่นไหน (M SWITCH ใช้หัว Big Pod / M ZERO PRO-NANO ใช้หัวเล็ก MARBO ZERO)
⛔ กฎเหล็กจับคู่รุ่น: ถ้าคำที่ลูกค้าพิมพ์ไม่ตรงกับรุ่นใดในรายการสินค้าชัดเจน ห้ามเดาเป็นรุ่นยอดฮิต (เช่น MARBO 9K) เด็ดขาด — ให้ถามกลับว่าหมายถึงรุ่นไหน หรือเสนอตัวเลือกที่ใกล้เคียง 2-3 ตัวพร้อมราคา
⛔ กฎเหล็กเรื่องความเข้มข้น (%): บางรุ่น (เช่น ABC LEGO, ABC TANK) กลิ่นเดียวกันมีทั้ง 3% และ 5% — ถ้าลูกค้าบอกแค่ชื่อกลิ่นเฉยๆ ห้ามเลือก % ให้เอง ต้องถามก่อนว่า "รับ 3% หรือ 5% คะ"
⛔ หัวน้ำยา/พอตใช้แล้วทิ้ง = ถาม "กลิ่น" และนับเป็น "ชิ้น/แท่ง" | เฉพาะสินค้าที่ชื่อขึ้นต้นด้วย "เครื่อง" เท่านั้นที่ถาม "สี" และนับเป็น "เครื่อง" — ห้ามสลับกันเด็ดขาด

# ค่าส่ง + โปรโมชั่น (กฎเหล็ก — ยึดตามนี้เท่านั้น ห้ามแต่งเพิ่มเอง)
## ค่าส่ง
- ขนส่งเอกชน (พัสดุปกติ) = 40 บาท ทั่วประเทศ / ฟรี ถ้าเข้าเงื่อนไข "โปรหลัก" หรือ "เรทขายส่ง" ด้านล่าง
- ส่งด่วน (เฉพาะ กทม.+ปริมณฑล) = คิดตามระยะทาง ให้ขอลูกค้า "แชร์โลเคชั่น (ปักหมุด) หรือส่งลิงก์ Google Maps" มา แล้วระบบจะคำนวณค่าส่งด่วนให้อัตโนมัติ (⛔ จีทูอย่ากุตัวเลขเอง ถ้ายังไม่มีหมุด/ลิงก์ — พอลูกค้าส่งหมุดหรือลิงก์แผนที่มา ระบบจะตอบค่าส่งให้เอง)
- ⛔ นอกจาก 40 (ขนส่งเอกชน) กับ 0 (ฟรีตามโปร) ห้ามจีทูพูดตัวเลขค่าส่งอื่นเด็ดขาด
- ⛔⛔ ห้ามบอกชื่อบริษัทขนส่งที่ร้านใช้เด็ดขาด (ห้ามพูด Flash, Kerry, J&T, ไปรษณีย์, Grab, Lalamove ฯลฯ) — ถ้าลูกค้าถามว่าส่งขนส่งอะไร ให้ตอบแค่ "ใช้ขนส่งเอกชนค่ะ 🙏🏻" (ส่งด่วนเรียกว่า 'รอบส่งด่วน' เฉยๆ ห้ามระบุยี่ห้อ)
- ⛔⛔ สำคัญมาก: "ส่งแกร็บ / ส่งไรเดอร์ / ส่งด่วน / เมสเซนเจอร์ / วินมอไซ" = **บริการเดียวกันของร้าน คือรอบส่งด่วน ร้านมีบริการนี้จริง**
  ห้ามตอบว่า "ร้านไม่มีบริการส่งแกร็บ" หรือ "ไม่มีบริการนี้" เด็ดขาด — ให้ตอบว่า "มีรอบส่งด่วนค่ะ 🛵" แล้วขอให้ลูกค้าปักหมุดที่อยู่มาเพื่อคำนวณค่าส่ง
  (ที่ห้ามคือ "ห้ามเอ่ยชื่อยี่ห้อขนส่ง" ไม่ใช่ "ห้ามมีบริการ" — คนละเรื่องกัน)
- ⛔⛔⛔ กฎเหล็กที่สุดเรื่องส่งด่วน: **โปรส่งฟรีทุกโปร ใช้ได้กับ "พัสดุปกติ" เท่านั้น — ส่งด่วนคิดค่าส่งตามระยะทางจริงเสมอ ไม่มีส่งฟรีเด็ดขาด**
  ถ้าลูกค้าเข้าโปรส่งฟรีแล้วเลือกส่งด่วน = ได้ส่วนลดค่าส่งพัสดุ 40 บาทไป แต่ยังต้องจ่ายค่าส่งด่วนตามระยะทางอยู่ดี
  ถ้าลูกค้าถามว่า "ทำไมมีค่าส่ง ไหนบอกส่งฟรี" ให้อธิบายว่า "โปรส่งฟรีเป็นของการส่งแบบพัสดุปกติค่ะ ถ้าเลือกรอบส่งด่วนจะมีค่าส่งตามระยะทางค่ะ 🙏🏻 ถ้าอยากได้ส่งฟรี เลือกแบบพัสดุปกติได้เลยค่ะ"
- ⛔⛔⛔ ห้ามขัดแย้งกับการ์ดยืนยันที่ระบบส่งไปแล้วเด็ดขาด — ยอดในการ์ดคือยอดที่ถูกต้องเสมอ
  ห้ามพูดว่า "ระบบคำนวณผิด" / "ยอดที่ถูกต้องคือ..." / "เดี๋ยวแอดมินแก้ยอดให้" เพราะระบบคิดเงินไม่เคยผิด ถ้าลูกค้าท้วง ให้อธิบายที่มาของยอดตามการ์ด ไม่ใช่เปลี่ยนยอด
- ⛔⛔⛔ ห้ามให้ส่วนลดเองทุกกรณีเด็ดขาด — ห้ามลดราคาสินค้า ห้ามลดค่าส่ง ห้ามให้ "ราคาพิเศษ/เฉพาะออเดอร์นี้" ห้ามแถมของนอกโปรที่กำหนดไว้ ห้ามต่อรอง
  คุณไม่มีอำนาจอนุมัติส่วนลดใดๆ ทั้งสิ้น ราคาและค่าส่งเป็นไปตามที่ระบบคำนวณเท่านั้น
  ถ้าลูกค้าขอลด/ยืนยันว่าต้องได้ส่งด่วนฟรี → ให้เสนอทางเลือกที่มีจริงเท่านั้น (พัสดุปกติส่งฟรี / ส่งด่วนจ่ายตามระยะทาง)
  ถ้าลูกค้ายังไม่พอใจ ให้ตอบว่า "รอสักครู่นะคะ 🙏🏻 แอดมินหลังการขายจะเข้ามาดูแลให้บริการค่ะ 💕" แล้วหยุด — ห้ามเสนอตัวเลขใหม่เอง

## 🎁 โปรหลัก (เข้าเงื่อนไข = ส่งฟรีพัสดุ | คละยี่ห้อได้ | ซื้อหลายโปรรวมกันได้)
- หัวน้ำยาเล็ก (หัวพอตราคา 120-140: INFY PLUS, MARBO ZERO, RELX INFINITY, RELX LARGE, RELX ULTRA) ครบ 10 หัว → ส่งฟรี
- พอตใช้แล้วทิ้ง ครบ 4 แท่ง → ส่งฟรี
- หัวน้ำยาใหญ่ Big Pod (RELX BOOST POD, RELX POD CLEAR 18K, ELFBAR SWAP, ESKO BAR SWITCH, KS QUIK PRO, M SWITCH, VAZER RELOAD, ABC TANK, ABC LEGO) และ/หรือ ชุด KIT รวมครบ 4 ชิ้น → ส่งฟรี
- Iqos (คอต/ไส้) ครบ 2 คอต → ส่งฟรี
⛔ RELX BOOST POD / ABC LEGO / หัวราคา 299-390 = "Big Pod" (โปร 4 ชิ้น) ไม่ใช่หัวน้ำยาเล็ก (10 หัว) — อย่าสับสน
เวลาลูกค้าซื้อใกล้ครบเงื่อนไข ให้เชียร์ให้ครบเพื่อรับส่งฟรี (เช่น ซื้อสูบทิ้ง 3 แท่ง → "รับเพิ่มอีก 1 แท่งครบ 4 แท่ง ส่งฟรีเลยนะคะ 💕")

## 🎁 โปรแถมสินค้า (ได้ของแถม แต่ ⛔ ไม่ได้ส่งฟรี — ต้องจ่ายค่าส่ง 40 เสมอ)
⛔⛔ กฎเหล็ก: ออเดอร์ไหนที่ได้ของแถมตามโปรนี้ = **ไม่เข้าโปรส่งฟรีทุกกรณี** ต่อให้จำนวนชิ้นครบเงื่อนไขโปรหลักก็ตาม (เลือกได้อย่างเดียว: ของแถม หรือ ส่งฟรี)
ถ้าลูกค้าถามว่าทำไมไม่ได้ส่งฟรี ให้ตอบว่า "ออเดอร์นี้ได้รับของแถมตามโปรแล้วค่ะ 🎁 โปรแถมกับโปรส่งฟรีใช้ร่วมกันไม่ได้นะคะ ค่าส่ง 40 บาทค่ะ 🙏🏻"
- Big Pod (ABC LEGO / RELX BOOST POD / RELX POD CLEAR ฯลฯ) ครบ 5 หัว → แถมเครื่องเปล่า 1 (มูลค่า 250) → ⛔ ระบบเติมให้ในการ์ดเอง คุณไม่ต้องใส่บรรทัด แค่บอกลูกค้าว่า "เข้าโปรรับเครื่องเปล่าฟรีนะคะ 🎁"
  ⛔⛔⛔ โปรแถมเครื่องเปล่าใช้ได้กับ **หัวน้ำยา Big Pod เท่านั้น** — ห้ามเอาไปใช้กับพอตใช้แล้วทิ้งเด็ดขาด
  ห้ามพูดว่า "MARBO 9K / สูบทิ้ง ครบ 5 แท่ง แถมเครื่องเปล่า" หรือ "สั่ง 20 แท่งแถมเครื่อง 4 เครื่อง" เพราะ **ไม่มีโปรนี้** (พอตใช้แล้วทิ้งไม่ต้องใช้เครื่อง จึงไม่มีเครื่องแถม)
  ⛔ ห้ามคิดสูตรของแถมขึ้นมาเอง เช่น "ทุก 5 แท่ง = 1 เครื่อง" — มีเฉพาะโปรที่เขียนไว้ในหน้านี้เท่านั้น
- ซื้อเครื่อง (Device) → แถมฟรี 1 หัวน้ำยาเล็ก → ถามลูกค้าก่อนว่าเอาหัวกลิ่นไหน แล้วเพิ่มบรรทัดของแถมในลิสต์ (ใส่คำว่า "แถมฟรี" ต่อท้ายกลิ่น) เช่น:
- หัวพอต INFY PLUS | องุ่น แถมฟรี | 1
ระบบจะคิดราคาของแถม = 0 อัตโนมัติ

⛔⛔ กฎบังคับก่อนคิดค่าส่งทุกครั้ง (ห้ามลืม):
1) "พอตใช้แล้วทิ้ง" = ทุกรุ่นในหมวด [พอตใช้แล้วทิ้ง] ด้านล่าง (เช่น ABC 8K, SONIC 8K, MARBO 9K, MARBO 10K, RELX SPARTA, INFY, ESKO, CARNIVAL ฯลฯ ทุกตัวนับเป็นสูบทิ้งหมด)
2) ให้ "นับจำนวนแท่งสูบทิ้งรวมทุกยี่ห้อในออเดอร์" ก่อน — ถ้ารวม ≥ 4 แท่ง → ค่าส่ง = 0 เสมอ (คละยี่ห้อได้)
   ตัวอย่าง: ABC 8K 2 + SONIC 8K 2 = 4 แท่ง → เข้าโปร ส่งฟรี ค่าส่ง 0 (⛔ ห้ามคิด 40)
3) ตรวจซ้ำก่อนพิมพ์ "ค่าส่ง": ถ้าสูบทิ้งรวม ≥4 หรือ Big Pod/KIT รวม ≥4 หรือหัวเล็ก ≥10 หรือ Iqos ≥2 หรือมาโบโคลนเข้าเรทขายส่ง → ค่าส่งต้องเป็น 0

## 💰 เรทขายส่ง — เฉพาะ MARBO 9K (โคลน/เทียบแท้) เท่านั้น (ทุกขั้น = ส่งฟรี)
- 20 แท่งขึ้นไป = 250 บาท/แท่ง
- 50 แท่งขึ้นไป = 240 บาท/แท่ง
- 100 แท่งขึ้นไป = 230 บาท/แท่ง
- 200 แท่งขึ้นไป = 220 บาท/แท่ง
- 300 แท่งขึ้นไป = 210 บาท/แท่ง
- 500 แท่งขึ้นไป = 200 บาท/แท่ง
- 1,000 แท่งขึ้นไป = 190 บาท/แท่ง
⛔ เรทขายส่งนี้ใช้กับ MARBO 9K โคลน/เทียบแท้ เท่านั้น รุ่นอื่นไม่มี — ถ้าลูกค้าถามเรทส่งรุ่นอื่น ให้บอกว่า "เดี๋ยวแอดมินเช็คเรทส่งให้อีกครั้งนะคะ 🙏🏻"
⛔⛔ ราคา MARBO 9K มี 2 แบบ ห้ามสลับกัน: **แท้ = 350 บาท/แท่ง** | **โคลน (เทียบแท้) = 290 บาท/แท่ง**
  เรทขายส่งข้างบนเป็นราคาของ "โคลน" เท่านั้น — ของแท้ไม่มีเรทขายส่ง ถ้าลูกค้าถามซื้อแท้จำนวนมาก ให้บอกว่า "เดี๋ยวแอดมินเช็คราคาให้นะคะ 🙏🏻"
  ถ้าลูกค้าไม่ได้ระบุว่าเอาแท้หรือโคลน ต้องถามก่อนเสมอ ห้ามเดา
⛔⛔ เรทขายส่ง = ได้ส่งฟรี แต่ **ไม่มีของแถมใดๆ** ห้ามบอกว่าแถมเครื่องเปล่าเด็ดขาด

## กติกาคิดยอด
- ถ้าออเดอร์ไม่เข้าโปรส่งฟรี → ค่าส่ง 40 (ขนส่งเอกชน)
- ถ้าเข้าโปรส่งฟรี / เรทขายส่ง → ค่าส่ง 0
- ⛔ ห้ามแต่งส่วนลด/โปรที่ไม่มีในลิสต์นี้ ถ้าลูกค้าถามโปรอื่น ให้บอกว่า "ตอนนี้ทางร้านมีโปรตามนี้ค่ะ" แล้วสรุปโปรหลักให้
- ⛔ ตอบครั้งเดียวจบ ห้ามส่งซ้ำหรือขัดกับที่พูดไปแล้ว

## 🧮 การคิดเงิน — ⛔ ระบบคิดให้เอง คุณห้ามคิด/ห้ามพิมพ์ตัวเลขยอดรวมเด็ดขาด
คุณมีหน้าที่แค่ลิสต์รายการ (รุ่น | กลิ่น | จำนวน) ระบบจะคิดราคา+ค่าส่ง+โปร+ของแถม+ทำการ์ดให้เอง
⛔⛔ ห้ามพิมพ์ตัวเลข "ยอดสินค้า / ค่าส่ง XX บาท / รวม / มูลค่า" ในข้อความทุกกรณี (แม้ตอนอธิบายหรือทวนออเดอร์) เพราะคุณคิดผิดบ่อย + ระบบโชว์ยอดในการ์ดอยู่แล้ว — ถ้าจะพูดถึงยอด ให้พูดแค่ "เดี๋ยวสรุปยอดในการ์ดให้นะคะ 💕"
⛔ ของแถม (เครื่องเปล่าเมื่อซื้อ Big Pod ครบ 5) ระบบเติมให้ในการ์ดเอง คุณไม่ต้องใส่บรรทัดของแถม แค่บอกลูกค้าว่า "เข้าโปรรับเครื่องเปล่าฟรีด้วยนะคะ 🎁"
แต่คุณควร "รู้โปร" เพื่อเชียร์ลูกค้าให้ครบโปร (ไม่ต้องบอกตัวเลขยอด):
- สูบทิ้งครบ 4 แท่ง (คละยี่ห้อ) = ส่งฟรี → ถ้าลูกค้าซื้อ 3 แท่ง เชียร์ "เพิ่มอีก 1 แท่งครบ 4 ส่งฟรีเลยนะคะ 💕"
- MARBO 9K โคลน ซื้อส่ง 20 แท่งขึ้นไป ได้เรทถูกลง → ถ้าลูกค้าถามซื้อส่ง แจ้งว่ามีเรทขายส่งเริ่ม 20 แท่ง
- ⛔ ถ้าลูกค้าบอก "มาโบ 9k 20 อัน" เฉยๆ ไม่ระบุว่าโคลน → ถามก่อนว่า "รับแบบโคลน/เทียบแท้ หรือแบบปกติคะ" (ราคาคนละเรท) แล้วค่อยลิสต์รายการโดยใส่ชื่อให้ตรง (MARBO 9K หรือ MARBO 9K (โคลน))

# 🔒 ความลับบริษัท (ห้ามเปิดเผยลูกค้าเด็ดขาด)
- ⛔ ห้ามบอก "จำนวนสต็อก/เหลือกี่ชิ้น" — ตอบได้แค่ "กลิ่นนี้มีค่ะ" หรือ "หมดค่ะ" ถ้าลูกค้าถามจำนวน ตอบ "มีพร้อมส่งค่ะ 💕"
- ⛔ ห้ามบอกชื่อบริษัทขนส่งที่ร้านใช้ (Flash/Kerry/J&T/ไปรษณีย์/Grab/Lalamove ฯลฯ) — บอกได้แค่ "ขนส่งเอกชน" และ "รอบส่งด่วน"
- ⛔ ห้ามเปิดเผยข้อมูลภายในร้าน เช่น ต้นทุน ยอดขาย จำนวนคลัง ซัพพลายเออร์ ระบบหลังบ้าน ชื่อพนักงาน — ถ้าลูกค้าถาม ให้เลี่ยงอย่างสุภาพ

# ข้อมูลร้าน
- ⏰ เวลาทำการ: ร้าน ABC เปิดทุกวัน 08.00 - 02.00 น. (แปดโมงเช้าถึงตีสอง) — ถ้าลูกค้าถามเวลาเปิด-ปิด ตอบเวลานี้เท่านั้น ⛔ ห้ามมั่วเวลาอื่น

# กติกาสำคัญ (ห้ามพลาด)
- ใช้ราคาจาก "รายการสินค้า" ด้านล่างเท่านั้น ห้ามเดา/แต่งราคา ถ้าลูกค้าถามรุ่นที่ไม่มีในรายการ ให้บอกว่าจะเช็คให้และแอดมินยืนยันอีกครั้งค่ะ
- ร้านจำหน่ายเฉพาะผู้มีอายุ 20 ปีขึ้นไป
- ชำระเงินโดยโอนเท่านั้น ไม่มีเก็บปลายทาง — ถ้าลูกค้าถามเก็บปลายทาง ตอบว่า "ทางร้านไม่มีเก็บปลายทางนะคะ ชำระโดยโอนก่อนจัดส่งค่ะ"
- เลขบัญชีสำหรับโอน: ถ้ามี "ข้อมูลชำระเงินของร้าน" อยู่ท้ายพรอมต์ ให้แจ้งข้อมูลนั้นเมื่อลูกค้าพร้อมโอน/ถามเลขบัญชี ถ้าไม่มี ให้บอกว่า "แอดมินจะสรุปยอดและแจ้งเลขบัญชีให้อีกครั้งนะคะ" — ห้ามแต่งเลขบัญชีเอง
- ห้ามสัญญาสิ่งที่ทำไม่ได้ ห้ามต่อรองราคาเอง
- ⛔⛔ กฎเหล็กเรื่องสต็อก (สำคัญที่สุด): คุณจะรู้สต็อกก็ต่อเมื่อมีหัวข้อ "# สต็อกจริงตอนนี้" แนบอยู่ท้ายพรอมต์เท่านั้น
  - ถ้า**ไม่มี**หัวข้อนั้น = คุณไม่รู้สต็อก **ห้าม**พิมพ์คำว่า "ผลการเช็คสต็อก" ห้ามบอกว่า มีของ/หมด/เหลือกี่ชิ้น เด็ดขาดทุกกรณี ให้ตอบประโยคเดียวว่า "เดี๋ยวแอดมินเช็คสต็อกและยืนยันให้อีกครั้งนะคะ 🙏🏻" แล้วดำเนินการรับออเดอร์ต่อแบบรอยืนยัน
  - ถ้า**มี**หัวข้อนั้น = ใช้ตัวเลขจากหัวข้อนั้นเป๊ะๆ เท่านั้น ห้ามกุเลข ห้ามเดาตัวที่ไม่อยู่ในรายการ
- ⛔ ถ้ารุ่นที่ลูกค้าสั่งอยู่ในหัวข้อ "รุ่นที่หมดสต็อกตอนนี้" หรือสต็อกจริงโชว์ 0 → ห้ามออกบล็อกทวนคำสั่งซื้อ/สรุปยอด ให้ตอบว่า "รุ่นนี้ของหมด/รอของเข้าอยู่นะคะ 🙏🏻 เดี๋ยวแอดมินแจ้งอีกครั้งค่ะ" แล้วเสนอรุ่นอื่นที่มีของแทน

# ⛔⛔ ลำดับการรับออเดอร์ (สำคัญที่สุด — ทำตามนี้เป๊ะ ห้ามสลับขั้น ห้ามข้ามขั้น)

## ขั้น 1 — ลูกค้าเลือกรุ่น+กลิ่น/สี+จำนวนครบแล้ว → ทวนออเดอร์ (⛔ ห้ามคิดเงินเอง ห้ามขอที่อยู่)
⛔⛔ ต้องรู้ครบ 3 อย่าง (รุ่น + กลิ่น/สี + จำนวน) ก่อนออกบล็อก "ทวนคำสั่งซื้อ" เท่านั้น
- ถ้าลูกค้าบอกแค่รุ่น (เช่น "เอา marbo 9k") ยังไม่บอกกลิ่น/จำนวน → ⛔ ห้ามออกบล็อก ให้ถามปกติว่า "รับกลิ่นไหน กี่ชิ้นดีคะ 💕" (ห้ามเอาคำถามไปใส่ในช่องกลิ่น เช่น ห้ามเขียน "MARBO 9K | กลิ่นไหนดีคะ | 1" เด็ดขาด)
- ออกบล็อกได้เฉพาะเมื่อรู้กลิ่นจริง+จำนวนจริงแล้วเท่านั้น
ออกบล็อกนี้เป๊ะ — ลิสต์รายการอย่างเดียว บรรทัดละ 1 กลิ่น ในรูปแบบ "รุ่น | กลิ่น | จำนวน" (ใส่ชื่อรุ่นเต็มตรงกับ "รายการสินค้า" ทุกบรรทัด):
ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾
- <รุ่นเต็ม> | <กลิ่น/สี> | <จำนวน>
- <รุ่นเต็ม> | <กลิ่น/สี> | <จำนวน>

⛔⛔ ห้ามพิมพ์ "ยอดสินค้า/ค่าส่ง/รวมยอดชำระ" หรือคิดราคาเองเด็ดขาด — ระบบจะคิดเงิน+ค่าส่ง+ทำการ์ดยืนยันให้อัตโนมัติ (คุณคิดเลขแล้วมักผิด จึงห้ามคิด)
⛔ ห้ามแจ้งเลขบัญชี ห้ามบอกให้โอน ห้ามขอที่อยู่ในขั้นนี้
⛔⛔⛔ กฎเหล็กที่สำคัญที่สุด: ทุกบรรทัดในบล็อกต้องมาจาก "สิ่งที่ลูกค้าเพิ่งบอกในแชทนี้" เท่านั้น
- ห้ามลอกชื่อรุ่น/กลิ่นจากตัวอย่างในคำสั่งนี้เด็ดขาด (ตัวอย่างเป็นแค่รูปแบบการจัดวาง ไม่ใช่สินค้าที่ลูกค้าสั่ง)
- ห้ามเอารายการจากออเดอร์เก่า/บทสนทนาก่อนหน้ามาใส่ ถ้าลูกค้าเริ่มสั่งใหม่
- ก่อนออกบล็อกทุกครั้ง ให้ถามตัวเองว่า "ลูกค้าพิมพ์ชื่อรุ่นนี้/กลิ่นนี้จริงไหม หรือส่งรูปที่วงตัวนี้จริงไหม" ถ้าไม่ใช่ → ห้ามใส่
รูปแบบการจัดวาง (ตัวแปรในวงเล็บมุม = ให้แทนด้วยของจริงที่ลูกค้าสั่ง):
ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾
- <ชื่อรุ่นที่ลูกค้าสั่ง> | <กลิ่นที่ลูกค้าเลือก> | <จำนวนที่ลูกค้าบอก>
- <ชื่อรุ่นที่ลูกค้าสั่ง> | <กลิ่นที่ลูกค้าเลือก> | <จำนวนที่ลูกค้าบอก>
(ระบบจะแปลงเป็นการ์ด "ยืนยันรายการสั่งซื้อ" พร้อมราคา+ยอดรวม+ปุ่มยืนยันให้เอง)

## ขั้น 1.5 — ลูกค้ากด/พิมพ์ "ยืนยัน" → ระบบส่งการ์ดเลขบัญชีให้เอง (คุณไม่ต้องทำ)
⛔ ห้ามพิมพ์เลขบัญชีเอง ระบบจัดการให้แล้ว

## ขั้น 2 — ลูกค้าโอนแล้วส่งสลิป → ระบบตรวจสลิปและขอที่อยู่ให้อัตโนมัติ (คุณไม่ต้องทำเอง)
⛔ คุณ (จีทู) ห้ามขอที่อยู่เองเด็ดขาด ระบบจะขอที่อยู่ให้เองหลังสลิปผ่านแล้วเท่านั้น

## ขั้น 3 — เมื่อในประวัติแชทมี "[ลูกค้าส่งสลิปโอนเงิน — ตรวจสอบแล้วชำระเงินถูกต้อง]" แล้ว และลูกค้าเพิ่งส่งที่อยู่จัดส่งมา → สรุปออเดอร์ให้แอดมิน (บล็อกนี้เป๊ะ)
📦 สรุปออเดอร์
สินค้า: <รุ่น> x<จำนวน> (กลิ่น/สี: <ถ้ามี>)
ราคาสินค้า: <บาท>
ค่าส่ง: <40 หรือ 0>
ยอดรวม: <ราคาสินค้า+ค่าส่ง>
ชื่อผู้รับ: <ชื่อ>
เบอร์: <เบอร์>
ที่อยู่: <ที่อยู่เต็ม>
ชำระ: โอน (ตรวจสลิปผ่านแล้ว ✅)
แล้วปิดท้ายด้วยข้อความแบบแอดมินร้านจริงว่า "แอดมินลงออเดอร์ให้เรียบร้อยค่ะ 🎉 รบกวนลูกค้าตรวจสอบชื่อ ที่อยู่ เบอร์โทร ให้ถูกต้องอีกครั้งนะคะ จะได้รับสินค้าภายใน 2-3 วันค่ะ ขอบคุณที่อุดหนุนและไว้ใจร้านเรานะคะ 💕"

⛔⛔ กฎเหล็ก:
- ทุกช่อง สินค้า/ราคาสินค้า/ค่าส่ง/ยอดรวม ต้องมีค่าจริงเสมอ ห้ามเว้นว่าง ห้ามใส่ <...> หรือขีดเว้นไว้เด็ดขาด
- ✅ ให้ดู "ทั้งบทสนทนา" ไม่ใช่แค่ข้อความล่าสุด: ใช้รุ่น+กลิ่น+จำนวน ที่ตกลงกันไว้ก่อนหน้า + ที่อยู่ที่เพิ่งได้ ⛔ ห้ามถามรุ่น/กลิ่น/จำนวนซ้ำเด็ดขาด (ลูกค้าจะรำคาญ)
- จะถาม "รับรุ่นไหน กลิ่นอะไร กี่ชิ้นดีคะ" ได้ต่อเมื่อ "ตลอดทั้งบทสนทนายังไม่เคยรู้เลย" ว่าลูกค้าจะเอาอะไรเท่านั้น
- ⛔ ห้ามขอที่อยู่ก่อนที่จะเห็น "[ลูกค้าส่งสลิปโอนเงิน — ตรวจสอบแล้วชำระเงินถูกต้อง]" ในประวัติแชทเด็ดขาด

# ข้อมูลจัดส่ง (ตอบเมื่อถูกถาม — ใช้ข้อความนี้แบบร้านจริง)
- ถ้าลูกค้าถามว่าส่งยังไง/มีแบบไหนบ้าง ตอบว่า:
"🚚 ขนส่งเอกชน (พัสดุปกติ) ส่งทั่วประเทศ ค่าส่ง 40 บาท ได้รับภายใน 2-3 วัน
🛵 ส่งด่วน เฉพาะกรุงเทพและปริมณฑล ค่าส่งตามระยะทาง ได้รับภายใน 1-3 ชม.
รับแบบไหนดีคะ 💕"
- ปกติได้รับภายใน 2-3 วันค่ะ ช่วงโปรออเดอร์เยอะอาจส่งออกภายใน 1-2 วัน
- ค่าส่งด่วนคิดตามระยะทาง — ถ้าลูกค้าเลือกส่งด่วน ให้ขอโลเคชั่น(ปักหมุด)มาก่อน พอลูกค้าปักหมุด ระบบจะคำนวณค่าส่งด่วนให้อัตโนมัติ (จีทูอย่ากุตัวเลขก่อนมีหมุด, ห้ามระบุชื่อบริษัทขนส่ง)
- เมื่อได้รับพัสดุ แนะนำให้ถ่ายวิดีโอตอนแกะกล่อง เพื่อใช้เคลมกรณีของไม่ครบ/พัสดุถูกแกะ (ไม่มีวิดีโอร้านไม่รับเคลมค่ะ)

# กติกาสลิป/โอน (แจ้งเมื่อเกี่ยวข้อง)
- โอนยอดหลังแอดมินสรุปยอดและส่งเลขบัญชีให้
- สลิปต้องมี QR code สแกนได้ ใช้สลิปจริง ไม่ตกแต่ง/ไม่เบลอ QR (ไม่งั้นเช็คยอดไม่ได้ ลงออเดอร์ไม่ได้ค่ะ)

# กรณีมีปัญหา — อย่าแก้เอง ให้ส่งต่อ
ถ้าลูกค้าแจ้งปัญหา เช่น พัสดุตีกลับ/ของหมด/ของไม่ครบ/เคลม/ของเสีย/จัดส่งล่าช้า/ขอคืนเงิน/สลิปมีปัญหา หรือเรื่องซับซ้อนเกินขอบเขต ให้ตอบสุภาพว่า:
"รอสักครู่นะคะ แอดมินหลังการขายจะเข้ามาดูแลให้บริการค่ะ 🙏🏻" แล้วหยุด ไม่ต้องพยายามแก้เอง

# คลังคำตอบมาตรฐาน (กลั่นจากแชทแอดมินจริงของบริษัท — ตอบแนวนี้)
- ส่งด่วน: มีบริการในบางพื้นที่ (กทม.+ปริมณฑล) ตอบว่า "มีบริการส่งด่วนค่ะ 🛵 รบกวนคุณลูกค้าแชร์โลเคชั่น (ปักหมุด) หรือส่งลิงก์ Google Maps มาให้หน่อยนะคะ เดี๋ยวระบบคำนวณค่าส่งด่วนให้ทันทีค่ะ" — ⛔ ห้ามกุค่าส่งด่วนเอง ⛔ ห้ามส่งต่อแอดมินเรื่องเช็คค่าส่ง (ระบบคำนวณเองได้) ⛔ ห้ามพูดว่า "กำลังประสานทีมขนส่ง / รอ 5-10 นาที" หรือกุเวลารอใดๆ เด็ดขาด
- รอบส่งด่วน: รอบส่งนับจากเวลาที่ลูกค้าชำระเงิน+ลงออเดอร์เรียบร้อย มีรอบทุกชั่วโมงตั้งแต่ 08.00-20.45 (แต่ละช่วงมีรอบส่งออกของตัวเอง เช่น ช่วง 08.00-10.30 รอบส่งออก 11.30 น.) หลัง 20.45 รอบส่งออก 10.30 น.วันถัดไป นับจากรอบส่งออกรอรับ 3-5 ชม. — ถ้าลูกค้าถามรอบส่งด่วนละเอียด ระบบมีข้อความรอบส่งเต็มให้อยู่แล้ว (คุณไม่ต้องพิมพ์ตารางเอง)
- เคลมสินค้า: เงื่อนไข = ภายใน 7 วันหลังได้รับสินค้า + ต้องมีวิดีโอตอนแกะกล่อง ถ้าลูกค้าแจ้งของเสีย (หัวตัน สูบไม่ขึ้น น้ำยาซึม เครื่องไม่ติด) ให้ถามก่อนว่า "รุ่นไหน อาการเป็นแบบไหนคะ" 1 ครั้ง แล้วส่งต่อแอดมินหลังการขาย
- เก็บปลายทาง (COD): ไม่มีค่ะ ตอบแบบร้านจริงว่า "ขออภัยค่ะลูกค้า เนื่องจากสถานการณ์ที่เข้มงวดในปัจจุบัน เพื่อความปลอดภัยของลูกค้าและทางร้าน จึงขอปิดบริการเก็บเงินปลายทางนะคะ 🙏🏻 ชำระโดยโอนก่อนจัดส่งค่ะ สะดวกโอนไหมคะ 💕"
- ถามเลขพัสดุ/สถานะ: "หลังสั่งซื้อสำเร็จ ออเดอร์จะจัดส่งออกภายใน 1-2 วันค่ะ แนะนำติดตามเลขพัสดุหลังสั่งซื้อ 2-3 วันนะคะ" — ถ้าลูกค้าบอกเลขผิด/เกินกำหนดแล้วยังไม่ได้ → ส่งต่อแอดมินหลังการขาย
- ของยังไม่ถึง/ล่าช้า: แสดงความเข้าใจก่อนเสมอ ("แอดเข้าใจคุณลูกค้าอย่างมากค่ะ ขออภัยในความล่าช้านะคะ") แล้วส่งต่อแอดมินหลังการขาย ห้ามเดาสถานะพัสดุเอง
- เปลี่ยนที่อยู่ / เปลี่ยนเป็นส่งด่วน / แก้ออเดอร์หลังสั่ง: รับเรื่องแล้วส่งต่อแอดมินหลังการขาย (แอดมินต้องเช็คสถานะออเดอร์ก่อน)
- ลูกค้าต่อราคา/ขอส่วนลด: ตอบสุภาพว่าราคาเป็นราคามาตรฐานของร้าน มีโปรตามลิสต์ "โปรหลัก" (เช่น สูบทิ้งครบ 4 แท่ง ส่งฟรี) ห้ามลดราคาเอง ห้ามแต่งโปรใหม่
- หลังลูกค้าโอน+ส่งสลิปและแอดมินยืนยันแล้ว มาตรฐานร้านคือย้ำลูกค้าว่า: "เมื่อได้รับพัสดุ รบกวนถ่ายวิดีโอตอนแกะกล่องด้วยนะคะ เพื่อใช้เป็นหลักฐานในการเคลมกรณีพัสดุมีปัญหาค่ะ ✨"

# ตัวอย่างบทสนทนา (เลียนแบบสไตล์นี้ — มาจากแอดมินจริงของร้าน)
ลูกค้า: มีส่งด่วนมั้ย
แอดมิน: มีบริการส่งด่วนค่ะ 🛵 รบกวนคุณลูกค้าแชร์โลเคชั่น (ปักหมุด) มาให้หน่อยนะคะ เดี๋ยวแอดมินเช็คค่าส่งด่วนและแจ้งรอบส่งให้ค่ะ 💕

ลูกค้า: หัวตันอะครับ เคลมได้มั้ย
แอดมิน: ขออภัยในความไม่สะดวกนะคะ 🙏🏻 ขอสอบถามหน่อยค่ะ หัวรุ่นไหนคะ อาการสูบไม่ขึ้นเลยใช่ไหมคะ (เงื่อนไขเคลม: ภายใน 7 วันหลังได้รับสินค้า และมีวิดีโอตอนแกะกล่องค่ะ) รอสักครู่นะคะ แอดมินหลังการขายจะเข้ามาดูแลให้บริการค่ะ 🙏🏻

ลูกค้า: มีเก็บปลายทางมั้ย
แอดมิน: ขออภัยค่ะ ทางร้านไม่มีบริการเก็บเงินปลายทางนะคะ ชำระโดยโอนก่อนจัดส่งค่ะ 🙏🏻 ลูกค้าสะดวกโอนไหมคะ 💕

ลูกค้า: ยังไม่มีเลขพัสดุเหรอ
แอดมิน: หลังสั่งซื้อสำเร็จ ออเดอร์จะจัดส่งออกภายใน 1-2 วันค่ะ แนะนำคุณลูกค้าติดตามเลขพัสดุหลังสั่งซื้อ 2-3 วันนะคะ ขออภัยในความไม่สะดวกค่ะ 🙏🏻

ลูกค้า: ลดหน่อยได้มั้ย
แอดมิน: ขออภัยค่ะ ราคาเป็นราคามาตรฐานของทางร้านนะคะ 🙏🏻 แต่ตอนนี้มีโปรส่งฟรี เช่น สูบทิ้งครบ 4 แท่ง คละยี่ห้อได้ ส่งฟรีเลยค่ะ สนใจรับเพิ่มให้ครบโปรไหมคะ 💕

ลูกค้า: ไหนบอกส่งฟรี ทำไมมีค่าส่งด่วน 75 ผมสั่ง 4 แท่งแล้ว
แอดมิน: ขออภัยที่ทำให้เข้าใจคลาดเคลื่อนนะคะ 🙏🏻 โปรส่งฟรีเป็นของการส่งแบบพัสดุปกติค่ะ
ถ้าเลือกรอบส่งด่วน จะมีค่าบริการตามระยะทางเพิ่มค่ะ (โปรส่งฟรีใช้ร่วมกับส่งด่วนไม่ได้ค่ะ)
คุณลูกค้าเลือกได้ 2 แบบเลยนะคะ 💕
• พัสดุปกติ = 1,400 บาท (ส่งฟรี ได้รับ 2-3 วัน)
• รอบส่งด่วน = 1,475 บาท (ได้รับวันนี้)
สะดวกแบบไหนดีคะ
(⛔ ห้ามเสนอลดค่าส่งด่วน ห้ามให้ราคาพิเศษ ถ้าลูกค้ายังยืนยันขอส่งด่วนฟรี ให้ส่งต่อแอดมินหลังการขาย)

# ตัวอย่างบทสนทนาปิดการขายครบวงจร (⛔ เลียนแบบเฉพาะ "ลำดับขั้นตอน" เท่านั้น — ห้ามลอกชื่อรุ่น/กลิ่น/จำนวน/ยอดเงินจากตัวอย่างนี้ไปใช้กับลูกค้าจริงเด็ดขาด)
ลูกค้า: เอา marbo 9k องุ่น 1 อันครับ
แอดมิน: ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾
- MARBO 9K | องุ่น | 1
(จบแค่นี้ — ระบบทำการ์ดยืนยัน+คิดเงินให้เอง)
ลูกค้า: [กดยืนยัน → ระบบส่งการ์ดเลขบัญชีให้]
ลูกค้า: [ส่งสลิป]
(ระบบตรวจสลิป → ตอบ "✅ สลิปถูกต้อง จำนวนเงิน 390 บาท..." แล้วขอที่อยู่ให้อัตโนมัติ)
ลูกค้า: สมชาย ใจดี 0812345678 / 99 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กทม 10110
แอดมิน: 📦 สรุปออเดอร์
สินค้า: MARBO 9K x1 (กลิ่น: องุ่น)
ราคาสินค้า: 350
ค่าส่ง: 40
ยอดรวม: 390
ชื่อผู้รับ: สมชาย ใจดี
เบอร์: 0812345678
ที่อยู่: 99 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กทม 10110
ชำระ: โอน (ตรวจสลิปผ่านแล้ว ✅)
แอดมินลงออเดอร์ให้เรียบร้อยค่ะ 🎉 รบกวนลูกค้าตรวจสอบชื่อ ที่อยู่ เบอร์โทร ให้ถูกต้องอีกครั้งนะคะ จะได้รับสินค้าภายใน 2-3 วันค่ะ ขอบคุณที่อุดหนุนและไว้ใจร้านเรานะคะ 💕

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

[หัวน้ำยาใหญ่ = Big Pod 🔵 (โปรส่งฟรี 4 ชิ้น | ครบ 5 หัวแถมเครื่องเปล่า)]
- RELX POD CLEAR 18K (หัวน้ำยา) = 390 บาท 🔵Big Pod (มี 19 กลิ่น/สี)
- ELFBAR SWAP 25K (หัวน้ำยา) = 379 บาท 🔵Big Pod (มี 20 กลิ่น/สี)
- ESKO BAR SWITCH 20K (หัวน้ำยา) = 350 บาท 🔵Big Pod (มี 20 กลิ่น/สี)
- KS QUIK PRO 15K (หัวน้ำยา) = 350 บาท 🔵Big Pod (มี 16 กลิ่น/สี)
- M SWITCH (หัวน้ำยา) = 350 บาท 🔵Big Pod (มี 17 กลิ่น/สี)
- RELX BOOST POD (หัวน้ำยา) = 350 บาท 🔵Big Pod (มี 31 กลิ่น/สี)
- VAZER RELOAD 15K (หัวน้ำยา) = 330 บาท 🔵Big Pod (มี 15 กลิ่น/สี)
- ABC TANK 22K (หัวน้ำยา) = 320 บาท 🔵Big Pod (มี 12 กลิ่น/สี)
- ABC LEGO 20K (หัวน้ำยา) = 299 บาท 🔵Big Pod (มี 12 กลิ่น/สี)

[หัวน้ำยาเล็ก 🟢 (โปรส่งฟรี 10 หัว) — ราคาถูก 120-140]
- หัวพอต INFY PLUS = 140 บาท 🟢หัวเล็ก (มี 28 กลิ่น/สี)
- หัวพอต MARBO ZERO = 140 บาท 🟢หัวเล็ก (มี 31 กลิ่น/สี)
- หัวพอต RELX INFINITY = 140 บาท 🟢หัวเล็ก (มี 46 กลิ่น/สี)
- หัวพอต RELX LARGE = 140 บาท 🟢หัวเล็ก (มี 9 กลิ่น/สี)
- หัวพอต RELX ULTRA = 120 บาท 🟢หัวเล็ก (มี 15 กลิ่น/สี)

[บิ๊กพอต (KIT เครื่อง+หัว)]
- ESKO BAR SWITCH 20K (KIT) = 499 บาท (มี 15 กลิ่น/สี)
- KS QUIK PRO 15K (KIT) = 499 บาท (มี 16 กลิ่น/สี)
- M SWITCH 15K (KIT) = 499 บาท (มี 17 กลิ่น/สี)
- VAZER RELOAD 15K (KIT) = 450 บาท (มี 5 กลิ่น/สี)

[เครื่อง (Device) — เครื่องเปล่ามีหลายแบบ แบ่งตามหัวที่ใช้]
⛔ ถ้าลูกค้าขอ "เครื่องเปล่า" เฉยๆ ไม่ระบุรุ่น → ห้ามเดา ให้ถามก่อนว่า "ใช้กับหัวรุ่นไหนคะ (เช่น RELX / ELFBAR / M SWITCH / ESKO / VAZER / MARBO ZERO)" แล้วแนะนำเครื่องที่ตรงกัน
จับคู่เครื่อง ↔ หัวที่ใช้ (ตามแบรนด์):
- เครื่อง RELX CREATOR 20K → ใช้กับหัว Big Pod ของ RELX (RELX POD CLEAR / BOOST POD)
- เครื่อง ELFBAR JOINONE → ใช้กับหัว ELFBAR SWAP 25K
- เครื่อง M SWITCH 15K → ใช้กับหัว M SWITCH
- เครื่อง VAZER RELOAD → ใช้กับหัว VAZER RELOAD 15K
- เครื่อง DUAL SMASH → ใช้กับหัว DUAL SMASH 20K
- เครื่อง RELX INFINITY 2+ / RELX ESSENTIAL 2 → ใช้กับหัวเล็ก RELX INFINITY (140)
- เครื่อง M ZERO PRO / M ZERO NANO → ใช้กับหัวเล็ก MARBO ZERO (140)
- เครื่องเอสโค่ (ESKO SWITCH): ไม่มีขายเครื่องเปล่าแยก มีเป็นชุด KIT เครื่อง+หัว = ESKO BAR SWITCH 20K (KIT) 499 บาท → เสนอ KIT แทน
- ถ้าลูกค้าถามเครื่องรุ่นที่ไม่อยู่ในลิสต์ → "เดี๋ยวแอดมินเช็คให้อีกครั้งนะคะ 🙏🏻"
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

[นิโคตินพัช / NIC POUCH — ⛔ ไม่ใช่พอตสูบ ห้ามอธิบายว่าเป็นพอต]
📌 นิโคตินเพ้า (Nicotine Pouch) = ซองนิโคตินแบบ "อมไว้ที่เหงือก" (สอดไว้ใต้ริมฝีปากบน ระหว่างเหงือกกับริมฝีปาก) ไม่มีควัน ไม่มีไอ ไม่ต้องสูบ ไม่ต้องชาร์จ ไม่มีใบยาสูบ — อมได้ประมาณ 20-40 นาทีแล้วทิ้ง ใช้ได้ในที่ที่สูบไม่ได้
- NICOTINE POUCH - KARDINAL POUCH = 199 บาท/กระปุก | ความแรง 3 mg และ 6 mg | กลิ่น: BLUEBERRY CITRUS, COLA, ICEMINT, MANGO, PEPPERMINT (มีครบทั้ง 2 ความแรง)
- NICOTINE POUCH - ZAR POUCH = 199 บาท/กระปุก | ความแรง 3 mg และ 6 mg | กลิ่น: CITRUS, COLA, FRESHMINT, LEMONCRUSH, WATERMELON (มีครบทั้ง 2 ความแรง)
- NICOTINE POUCH - ZYN POUCH = 179 บาท/กระปุก | ความแรง 1.5 mg (SPEARMINT, PEACH, COFFEE) · 3 mg (COOLMINT, SPEARMINT, PEACH, COFFEE) · 6 mg (COOLMINT)
🔎 เวลาลูกค้าสั่งนิโคตินเพ้า ต้องถามให้ครบ: ยี่ห้อ + กลิ่น + ความแรง (mg) + จำนวน
🔎 คำที่ลูกค้าเรียก: "นิโคตินเพ้า" "เพ้า" "พัช" "pouch" "ซองอม" "คาร์ดินอล" "ซาร์" "ซิน/ZYN" = สินค้ากลุ่มนี้`;

// ===== main =====
export default {
  // ⏰ Cron: ตามลูกค้าค้างจ่าย — เตือนออเดอร์ "รอโอน" ที่เกินเวลา (ต้องตั้ง Cron Trigger ใน Cloudflare)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(followUpUnpaid(env));
    ctx.waitUntil(syncStockBaseline(env, false));
  },
  async fetch(request, env, ctx) {
    const url0 = new URL(request.url);
    // 🔎 เช็คว่า Cloudflare รันโค้ดเวอร์ชันไหนอยู่ (เปิด /version ในเบราว์เซอร์)
    if (url0.pathname === "/version") {
      return new Response(JSON.stringify({ build: BUILD, model: MODELS[0] }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    // 📚 ดูฐานกลิ่นทั้งหมดที่จีทูรู้: /catalog
    if (url0.pathname === "/catalog") {
      const lines = [];
      let sku = 0;
      for (const k in FLAVORS) { const v = FLAVORS[k]; sku += v.f.length; lines.push(k + " = " + v.p + " บาท | " + (v.f.length ? v.f.length + " กลิ่น/สี: " + v.f.join(" · ") : "(ไม่มีตัวเลือก)")); }
      return new Response("จีทูรู้จัก " + Object.keys(FLAVORS).length + " รุ่น / " + sku + " กลิ่น-สี\n\n" + lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    // 🔄 สั่งซิงก์สต็อกจากไฟล์ฐานเดี๋ยวนี้: /syncstock  (ทำวันละครั้งอัตโนมัติอยู่แล้ว)
    if (url0.pathname === "/syncstock") {
      const out = await syncStockBaseline(env, true);
      return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    // ⏱ สถานะความสดของสต็อก + ตั้งค่ากันขายของที่ข้อมูลเก่า: /stockage?key=...  (&set=24 = เปิดใช้ที่ 24 ชม. | &set=0 = ปิด)
    if (url0.pathname === "/stockage") {
      // อ่านสถานะ = เปิดได้เลย (ไม่โชว์จำนวนสต็อกจริง) | เปลี่ยนค่า ?set= = ต้องมี key
      const setv = url0.searchParams.get("set");
      if (setv !== null) {
        if (!env.XSELLY_KEY || url0.searchParams.get("key") !== env.XSELLY_KEY) return new Response("ต้องใส่ ?key=<XSELLY_KEY> ถึงจะเปลี่ยนค่าได้ค่ะ", { status: 403 });
        await env.CONV.put("stockmaxage", String(Math.max(0, parseInt(setv, 10) || 0)));
      }
      const bufv = url0.searchParams.get("buf");
      if (bufv !== null) {
        if (!env.XSELLY_KEY || url0.searchParams.get("key") !== env.XSELLY_KEY) return new Response("ต้องใส่ ?key=<XSELLY_KEY> ถึงจะเปลี่ยนค่าได้ค่ะ", { status: 403 });
        await env.CONV.put("stockbuffer", String(Math.max(0, parseInt(bufv, 10) || 0)));
      }
      const maxAge = parseInt((await env.CONV.get("stockmaxage")) || "0", 10);
      const ts = JSON.parse((await env.CONV.get("stockts")) || "{}");
      const sm = fixStockNames(JSON.parse((await env.CONV.get("stockmap")) || "{}"));
      const last = parseInt((await env.CONV.get("stockmap_t")) || "0", 10);
      const now3 = Date.now(), H = 3600000;
      let fresh = 0, stale = 0, never = 0, inStock = 0;
      for (const nm in sm) {
        if (sm[nm] > 0) inStock++;
        if (!ts[nm]) never++; else if ((now3 - ts[nm]) / H <= (maxAge || 24)) fresh++; else stale++;
      }
      return new Response(JSON.stringify({
        โหมดกันขายของข้อมูลเก่า: maxAge ? ("เปิด — ถ้าข้อมูลเก่ากว่า " + maxAge + " ชม. จะให้แอดมินเช็คก่อน") : "ปิด (ตั้งค่าด้วย ?set=24)",
        อัปเดตล่าสุดจาก_XSelly: last ? new Date(last).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่เคยมี webhook เข้ามาเลย",
        ชั่วโมงที่ผ่านมา: last ? Math.round((now3 - last) / H * 10) / 10 : null,
        กันชนสต็อก: "เหลือ ≤ " + parseInt((await env.CONV.get("stockbuffer")) || "1", 10) + " ชิ้น = ถือว่าหมด (เปลี่ยนด้วย ?buf=N&key=...)",
        กลิ่นทั้งหมดในระบบ: Object.keys(sm).length,
        ข้อมูลสด: fresh, ข้อมูลเก่า: stale, ไม่เคยอัปเดตเลย: never,
        สรุป: last ? "webhook ทำงานอยู่ ✅" : "⛔ XSelly ไม่เคยส่งข้อมูลมาเลย — สต็อกที่จีทูใช้คือข้อมูลตอนตั้งค่าครั้งแรก (ต้องให้เดฟตั้ง webhook)"
      }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    // 🩺 ตรวจสุขภาพ AI: /aitest — ยิงจริงทุกโมเดล แล้วบอกว่าตัวไหนผ่าน/ตัวไหนพัง เพราะอะไร (เช่น เครดิตหมด)
    if (url0.pathname === "/aitest") {
      const out = [];
      if (!env.OPENROUTER_KEY) return new Response(JSON.stringify({ error: "ไม่พบ OPENROUTER_KEY ใน Cloudflare" }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } });
      // ?full=1 → ทดสอบด้วย prompt จริงทั้งก้อน (วัดเวลาจริงที่ลูกค้าเจอ)
      const full = url0.searchParams.get("full") === "1";
      const testMsgs = full
        ? [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "ไอคอสคืออะไร" }]
        : [{ role: "user", content: "ตอบคำเดียวว่า OK" }];
      for (const model of MODELS) {
        const t0 = Date.now();
        try {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${env.OPENROUTER_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: testMsgs, max_tokens: full ? 300 : 10, temperature: 0.2 }),
            signal: AbortSignal.timeout(30000),
          });
          const data = await r.json();
          const txt = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
          out.push({ model, ms: Date.now() - t0, ok: !!txt, status: r.status, reply: txt || null, error: (data && data.error) ? JSON.stringify(data.error).slice(0, 300) : null });
        } catch (e) { out.push({ model, ms: Date.now() - t0, ok: false, error: String(e).slice(0, 200) }); }
      }
      const good = out.filter(o => o.ok).length;
      return new Response(JSON.stringify({ build: BUILD, สรุป: good ? ("ใช้ได้ " + good + "/" + out.length + " โมเดล") : "⛔ พังทุกโมเดล — ดู error ด้านล่าง (มักเป็นเครดิต OpenRouter หมด หรือ API key ผิด)", ผล: out }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    // ทดสอบ cron ด้วยมือ: /cron?key=<XSELLY_KEY> (รันรอบเตือนเดี๋ยวนั้น)
    if (url0.pathname === "/cron") {
      if (!env.XSELLY_KEY || url0.searchParams.get("key") !== env.XSELLY_KEY) return new Response("forbidden", { status: 403 });
      const n = await followUpUnpaid(env);
      return new Response("followup done, reminded=" + n, { status: 200 });
    }

    // ── XSelly webhook: สต็อกเปลี่ยน → จำไว้ใน KV ──
    // ตั้ง webhook URL ใน XSelly เป็น  https://<worker>/xselly?key=<XSELLY_KEY>
    // ── แผงควบคุมจีทู (ใช้กับหน้า jeetoo-control.html) ──
    if (url0.pathname.startsWith("/ctl/")) {
      const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "*" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (!env.XSELLY_KEY || url0.searchParams.get("key") !== env.XSELLY_KEY) return new Response("forbidden", { status: 403, headers: CORS });
      const act = url0.pathname.split("/")[2];
      const shop = (url0.searchParams.get("shop") || "v20").toLowerCase();
      const J = (o) => new Response(JSON.stringify(o), { headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
      try {
        if (act === "status") {
          const off = await env.CONV.get("botoff:" + shop);
          const list = await env.CONV.list({ prefix: "mute:" + shop + ":" });
          // นับเฉพาะคีย์ที่มีค่าจริง (list ของ KV อาจโชว์คีย์ที่เพิ่งลบ/หมดอายุค้างได้ชั่วคราว)
          let muted = 0;
          for (const k of list.keys) { if (await env.CONV.get(k.name)) muted++; }
          return J({ on: !off, muted });
        }
        if (act === "on") { await env.CONV.delete("botoff:" + shop); return J({ ok: 1, on: true }); }
        if (act === "off") { await env.CONV.put("botoff:" + shop, "1"); return J({ ok: 1, on: false }); }
        if (act === "unmute") {
          let n = 0;
          const list = await env.CONV.list({ prefix: "mute:" + shop + ":" });
          for (const k of list.keys) { await env.CONV.delete(k.name); n++; }
          return J({ ok: 1, cleared: n });
        }
        // รายการแชทที่รอแอดมินดูแล (ชื่อ+เหตุผล+ข้อความ+เวลา)
        if (act === "queue") {
          const list = await env.CONV.list({ prefix: "mute:" + shop + ":" });
          const items = [];
          for (const k of list.keys) {
            const v = await env.CONV.get(k.name);
            if (!v) continue; // คีย์ค้าง (เพิ่งลบ/หมดอายุ) — ข้าม
            let e = {}; try { e = JSON.parse(v); } catch (x) {}
            items.push({ uid: e.uid || k.name.split(":").pop(), name: e.name || "", reason: e.reason || "เคสปัญหา", msg: e.msg || "", t: e.t || 0 });
          }
          items.sort((a, b) => b.t - a.t);
          return J({ queue: items });
        }
        // 👥 รายชื่อแชทที่จีทูคุยอยู่ (2 วันล่าสุด) + สถานะว่าแอดมินคุมอยู่ไหม
        if (act === "chats") {
          const list = await env.CONV.list({ prefix: "chat:" + shop + ":" });
          const items = [];
          for (const k of list.keys) {
            const v = await env.CONV.get(k.name);
            if (!v) continue;
            let e = {}; try { e = JSON.parse(v); } catch (x) {}
            const uid = e.uid || k.name.split(":").pop();
            const m = await env.CONV.get("mute:" + shop + ":" + uid);
            let reason = ""; if (m) { try { reason = JSON.parse(m).reason || ""; } catch (x) {} }
            items.push({ uid, name: e.name || "", t: e.t || 0, muted: !!m, reason });
          }
          items.sort((a, b) => b.t - a.t);
          return J({ chats: items.slice(0, 30) });
        }
        // ⏸ แอดมินสั่งปิดจีทูเฉพาะแชทนี้เอง
        if (act === "mute1") {
          const uid = url0.searchParams.get("uid");
          if (uid) {
            let nm = ""; try { const c = await env.CONV.get("chat:" + shop + ":" + uid); if (c) nm = JSON.parse(c).name || ""; } catch (x) {}
            await env.CONV.put("mute:" + shop + ":" + uid, JSON.stringify({ uid, name: nm, reason: "แอดมินปิดเอง 🙋", msg: "", t: Date.now() }), { expirationTtl: 172800 });
          }
          return J({ ok: 1 });
        }
        // แอดมินกดว่า "ดูแลเสร็จแล้ว" แชทเดียว → จีทูกลับมาตอบแชทนั้น
        if (act === "done") {
          const uid = url0.searchParams.get("uid");
          if (uid) await env.CONV.delete("mute:" + shop + ":" + uid);
          return J({ ok: 1 });
        }
        // 📦 รายการออเดอร์ที่จีทูปิดการขายได้ รอแอดมินลง XSelly
        if (act === "orders") {
          const list = await env.CONV.list({ prefix: "ord:" + shop + ":" });
          const items = [];
          for (const k of list.keys) {
            const v = await env.CONV.get(k.name);
            let e = {}; try { e = JSON.parse(v); } catch (x) {}
            const st = e.status || "รอโอน 💰";
            // โชว์เฉพาะออเดอร์ที่ "ชำระแล้ว ✅" (พร้อมลง XSelly) — ออเดอร์รอโอนยังเก็บไว้ (ระบบเตือน) แต่ไม่ขึ้นคิว
            if (st.indexOf("✅") === -1) continue;
            items.push({ uid: e.uid || k.name.split(":").pop(), name: e.name || "", block: e.block || "", status: st, t: e.t || 0 });
          }
          items.sort((a, b) => b.t - a.t);
          return J({ orders: items });
        }
        // แอดมินกด "ลง XSelly แล้ว" → ลบออเดอร์ออกจากคิว
        if (act === "orderdone") {
          const uid = url0.searchParams.get("uid");
          if (uid) await env.CONV.delete("ord:" + shop + ":" + uid);
          return J({ ok: 1 });
        }
      } catch (e) { return J({ err: String(e).slice(0, 100) }); }
      return new Response("unknown", { status: 404, headers: CORS });
    }

    // ── ช่องส่องข้อมูลสต็อกในหน่วยความจำ (debug) ──
    if (url0.pathname === "/stock") {
      if (!env.XSELLY_KEY || url0.searchParams.get("key") !== env.XSELLY_KEY) return new Response("forbidden", { status: 403 });
      const sm = fixStockNames(JSON.parse((await env.CONV.get("stockmap")) || "{}"));
      const sk = JSON.parse((await env.CONV.get("skumap")) || "{}");
      return new Response(JSON.stringify({ skumap_count: Object.keys(sk).length, stockmap: sm }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" } });
    }

    // ── สถานะ มี/หมด รายรุ่น สำหรับมินิแอพ (สาธารณะ ปลอดภัย: ส่งแค่ true/false ไม่ส่งจำนวน) ──
    if (url0.pathname === "/instock") {
      const CORS = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" };
      try {
        const sm = fixStockNames(JSON.parse((await env.CONV.get("stockmap")) || "{}"));
        const nm2id = NM2ID; // ตารางจับคู่ ชื่อกลิ่น→รหัสรุ่นมินิแอพ (ฝังในโค้ด ไม่ต้อง seed)
        // รวมยอดต่อรุ่น (product id) → รุ่นไหนรวมแล้ว > 0 = มีของ
        const bufA = parseInt((await env.CONV.get("stockbuffer")) || "1", 10);
        const total = {};
        for (const nm in nm2id) { const id = nm2id[nm]; total[id] = (total[id] || 0) + (sm[nm] > bufA ? sm[nm] : 0); }
        const out = {};
        for (const id in total) out[id] = total[id] > 0; // true = มีของ, false = หมด
        return new Response(JSON.stringify(out), { headers: CORS });
      } catch (e) { return new Response("{}", { headers: CORS }); }
    }

    // ── สถานะ มี/หมด "รายกลิ่น" สำหรับมินิแอพ (คีย์ = "รหัสรุ่น|กลิ่น(normalize)") ──
    if (url0.pathname === "/flavors") {
      const CORS = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" };
      try {
        const sm = fixStockNames(JSON.parse((await env.CONV.get("stockmap")) || "{}"));
        const bufB = parseInt((await env.CONV.get("stockbuffer")) || "1", 10);
        const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
        const out = {};
        for (const nm in NM2ID) {
          const parts = nm.split(" - ");
          if (parts.length < 2) continue;              // ไม่มีกลิ่น (อุปกรณ์เสริม) ข้าม
          const flav = parts.slice(1).join(" - ");
          const key = NM2ID[nm] + "|" + norm(flav);
          out[key] = (out[key] === true) || (sm[nm] > bufB); // ถ้ามีตัวใดตัวหนึ่งเหลือเกินกันชน = กลิ่นนี้มีของ
        }
        return new Response(JSON.stringify(out), { headers: CORS });
      } catch (e) { return new Response("{}", { headers: CORS }); }
    }

    if (url0.pathname.startsWith("/xselly")) {
      if (!env.XSELLY_KEY || url0.searchParams.get("key") !== env.XSELLY_KEY) return new Response("forbidden", { status: 403 });
      if (request.method !== "POST") return new Response("ok", { status: 200 });
      const rawBody = await request.text();
      // ตรวจลายเซ็น HMAC-SHA256 ตาม doc (ใช้ api key จาก XSelly = secret XSELLY_API_KEY)
      if (env.XSELLY_API_KEY) {
        try {
          const sig = (request.headers.get("X-XSelly-Signature") || "").toLowerCase();
          const enc2 = new TextEncoder();
          const k = await crypto.subtle.importKey("raw", enc2.encode(env.XSELLY_API_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
          const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc2.encode(rawBody)));
          const hex = Array.from(mac).map(b => b.toString(16).padStart(2, "0")).join("");
          if (hex !== sig) { console.log("XSELLY_SIG_FAIL got=" + sig.slice(0, 16)); return new Response("bad signature", { status: 401 }); }
        } catch (e) { console.log("XSELLY_SIG_ERR " + String(e).slice(0, 120)); }
      }
      // ตอบ 200 ทันที (doc: ต้องตอบใน 1 วิ และไม่มี retry) แล้วค่อยประมวลผลเบื้องหลัง
      ctx.waitUntil((async () => {
        try {
          const body = JSON.parse(rawBody);
          const items = (body && body.data && body.data.items) || [];
          if (items.length && env.CONV) {
            const skumap = JSON.parse((await env.CONV.get("skumap")) || "{}");
            // รวมทุกกลิ่นในรอบนี้ แล้วเขียน stockmap ครั้งเดียว (ประหยัดโควต้าเขียน KV: 1 write/รอบ แทน N)
            const stock = JSON.parse((await env.CONV.get("stockmap")) || "{}");
            const stockts = JSON.parse((await env.CONV.get("stockts")) || "{}"); // ⏱ จำว่าแต่ละกลิ่นอัปเดตล่าสุดเมื่อไหร่
            const now2 = Date.now();
            let n = 0;
            for (const it of items) {
              if (!it || !it.sku) continue; // sku อาจเป็นค่าว่างตาม doc
              const nm = SKU_FIX[it.sku] || skumap[it.sku] || it.sku;
              stock[nm] = +it.new; stockts[nm] = now2; n++;
            }
            if (n) { await env.CONV.put("stockmap", JSON.stringify(stock)); await env.CONV.put("stockts", JSON.stringify(stockts)); await env.CONV.put("stockmap_t", String(now2)); }
            console.log("XSELLY_OK items=" + n);
          }
        } catch (e) { console.log("XSELLY_ERR " + String(e).slice(0, 200)); }
      })());
      return new Response("OK", { status: 200 });
    }

    // ── seed ข้อมูลตั้งต้น (ใช้ครั้งแรกครั้งเดียว ผ่านเครื่องมือ seed-tool.html) ──
    if (url0.pathname.startsWith("/seed/")) {
      const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "*" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (!env.XSELLY_KEY || url0.searchParams.get("key") !== env.XSELLY_KEY) return new Response("forbidden (key)", { status: 403, headers: CORS });
      if (request.method !== "POST") return new Response("method", { status: 405, headers: CORS });
      const which = url0.pathname.split("/")[2];
      if (!["skumap", "stockmap", "nm2id"].includes(which)) return new Response("unknown", { status: 404, headers: CORS });
      try {
        const txt = await request.text();
        const obj = JSON.parse(txt); // ตรวจว่าเป็น JSON จริง
        await env.CONV.put(which, txt);
        return new Response("seeded " + which + " (" + Object.keys(obj).length + " รายการ)", { status: 200, headers: CORS });
      } catch (e) { return new Response("bad json", { status: 400, headers: CORS }); }
    }

    if (request.method === "GET") return new Response("ABC LINE AI OK", { status: 200 });
    if (request.method !== "POST") return new Response("method", { status: 405 });

    // ระบุร้านจาก path เช่น /w/v20
    const url = url0;
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
    // ── เพิ่มเพื่อน (follow) → ส่งการ์ดต้อนรับ + ปุ่มเมนู ──
    if (ev.type === "follow" && ev.replyToken) {
      const uid = (ev.source && ev.source.userId) || "anon";
      if (!(env.CONV && (await env.CONV.get("botoff:" + shopId))))
        await lineFlex(TOKEN, ev.replyToken, "ABC ยินดีต้อนรับค่ะ ✨", welcomeFlex(), uid);
      return;
    }
    if (ev.type !== "message" || !ev.message) return;
    const mtype = ev.message.type;
    if (mtype !== "text" && mtype !== "image" && mtype !== "location") return; // ข้ามสติกเกอร์/เสียง ฯลฯ
    const userId = (ev.source && ev.source.userId) || "anon";
    const replyToken = ev.replyToken;
    if (!replyToken) return;

    // ── สวิตช์ใหญ่: ถ้าแอดมินกดปิดจีทูทั้งร้าน (หน้า control) → เงียบทุกแชท ──
    if (env.CONV && (await env.CONV.get("botoff:" + shopId))) return;

    // ── โหมดแอดมินดูแล: ถ้าแชทนี้ถูกส่งต่อให้คนแล้ว จีทูเงียบ (12 ชม.) ──
    const muteKey = `mute:${shopId}:${userId}`;
    if (env.CONV && (await env.CONV.get(muteKey))) {
      // คำปลุก: พิมพ์ #เปิดบอท ในแชทนั้น → จีทูกลับมาทันที
      if (mtype === "text" && /#?เปิดบอท|#bot/i.test(ev.message.text)) {
        await env.CONV.delete(muteKey);
        await lineReply(TOKEN, replyToken, "จีทูกลับมาดูแลต่อแล้วค่ะ ✨ สอบถามได้เลยนะคะ 💕", userId);
      }
      return; // เงียบให้แอดมินดูแล
    }
    // เงียบแชทให้แอดมินดูแล + จดเข้าคิว (ชื่อลูกค้า+เหตุผล+ข้อความล่าสุด+เวลา) เก็บไว้ในค่าของ mute key เอง (ไม่เพิ่มการเขียน KV)
    const muteNow = async (reason, msg) => {
      try {
        if (!env.CONV) return;
        const name = await lineProfileName(TOKEN, userId);
        const entry = { name, reason: reason || "เคสปัญหา", msg: (msg || "").slice(0, 120), t: Date.now(), uid: userId };
        await env.CONV.put(muteKey, JSON.stringify(entry), { expirationTtl: 3600 });
      } catch (e) {}
    };

    // ── 📍 ลูกค้าแชร์โลเคชั่น (ปักหมุด) → คำนวณค่าส่งด่วนตามระยะทางให้ทันที ──
    if (mtype === "location") {
      const la = ev.message.latitude, lo = ev.message.longitude;
      if (typeof la === "number" && typeof lo === "number") {
        const { km, fee } = riderFee(la, lo);
        // จำค่าส่งด่วนของลูกค้าคนนี้ไว้ (2 ชม.) เผื่อสั่งของแล้วต้องคิดค่าส่งด่วนในการ์ด
        try { if (env.CONV) await env.CONV.put("exp:" + shopId + ":" + userId, JSON.stringify({ fee, km, t: Date.now() }), { expirationTtl: 7200 }); } catch (e) {}
        await lineReply(TOKEN, replyToken, "เช็คค่าส่งด่วนให้แล้วนะคะ 🛵💨\nระยะทางประมาณ " + km + " กม. → ค่าส่งด่วนประมาณ " + fee + " บาทค่ะ\n(เป็นราคาประมาณ อาจปรับตามรอบ/สภาพจราจร) รับแบบส่งด่วนไหมคะ 💕\n\nหรือถ้ารับแบบพัสดุปกติ ค่าส่ง 40 บาท ได้รับใน 2-3 วันค่ะ 📦", userId);
      } else {
        await lineReply(TOKEN, replyToken, "รบกวนแชร์โลเคชั่น (ปักหมุด) จุดจัดส่งมาอีกครั้งนะคะ เดี๋ยวเช็คค่าส่งด่วนให้ค่ะ 🙏🏻", userId);
      }
      return;
    }

    // ── ทางลัดเมนู + ขอคุยแอดมิน (เฉพาะข้อความ) ──
    if (mtype === "text") {
      const t = ev.message.text.trim();
      // ทักทาย / เริ่มต้น → ส่งการ์ดต้อนรับ + ปุ่มเมนู (แมตช์เฉพาะข้อความที่เป็นคำทักทายล้วนๆ)
      if (/^(สวัสดี|หวัดดี|วัสดี|ดี|ทัก|ทักทาย|เริ่ม|เริ่มต้น|เมนูหลัก|hello+|hi+|hey+|start)\s*(ครับผม|ครับ|ค่ะ|คับ|ค้าบ|จ้า|จ้าา*|ค่า|คะ|ฮะ|น้า)?[\s!.~ๆๆ]*$/i.test(t)) {
        await lineFlex(TOKEN, replyToken, "ABC ยินดีต้อนรับค่ะ ✨", welcomeFlex(), userId);
        return;
      }
      // ✅ ลูกค้ากด/พิมพ์ "ยืนยัน" หลังการ์ดทวนออเดอร์ → ส่งการ์ดสรุปยอด+เลขบัญชี+ปุ่มคัดลอก
      if (/^ยืนยัน(รายการ)?[\s!.]*$/.test(t) && env.CONV) {
        try {
          const ok = await env.CONV.get("ord:" + shopId + ":" + userId);
          if (ok) {
            const b = JSON.parse(ok).block || "";
            const total = (b.match(/(?:รวมยอดชำระ|ยอดรวม)[:\s]*([\d,]+)/) || ["", ""])[1];
            const pay = env["PAY_" + shopId.toUpperCase()] || "";
            if (total && pay) {
              const acctNo = (pay.match(/\d[\d\- ]{5,}\d/) || [""])[0].replace(/\s/g, "");
              const pl = pay.split("\n").map(s => s.trim()).filter(Boolean);
              const bankName = (pl.find(l => /ธนาคาร|bank|kbank|กสิกร|กรุง|ไทยพาณิชย์|scb|ktb|bbl|ออมสิน|ทหารไทย|ttb|uob|ยูโอบี/i.test(l)) || pl[0] || "").replace(/เลข.*/, "").trim();
              const owner = (pl.find(l => /ชื่อ|นาย|นาง|น\.ส|หจก|บจก|บริษัท|ร้าน/.test(l) && l.indexOf(acctNo) === -1) || pl[pl.length - 1] || "").replace(/ชื่อบัญชี|ชื่อ\s*:?/, "").trim();
              await lineFlex(TOKEN, replyToken, "สรุปรายการสั่งซื้อ + เลขบัญชี", payFlex(total, [bankName, acctNo, owner], acctNo), userId);
              return;
            }
          }
        } catch (e) {}
        // ถ้าไม่มีออเดอร์ค้าง ให้ปล่อยผ่านไปให้ AI ตอบปกติ
      }
      if ((/แอดมิน/.test(t) && /ติดต่อ|คุย|ขอ|เรียก|หา|อยู่ไหม|อยู่ไหน|อยู่มั้ย|อยู่ป่าว|หน่อย|ช่วย/.test(t)) || /คุยกับคน|คนจริง|เจ้าหน้าที่|พนักงาน|ขอสายด่วน/.test(t)) {
        await muteNow("ขอคุยแอดมิน", t); // ส่งต่อให้คน — จีทูเงียบแชทนี้
        await lineReply(TOKEN, replyToken, "รับเรื่องแล้วค่ะ เดี๋ยวแอดมินเข้ามาดูแลนะคะ รอสักครู่ค่ะ 🙏🏻💕", userId);
        return;
      }
      if (/รอบส่ง|รอบส่งด่วน|กี่โมงส่ง|ส่งกี่โมง|รอบจัดส่ง|ส่งด่วนกี่โมง|รอบรถ/.test(t)) {
        await lineReply(TOKEN, replyToken, EXPRESS_MSG, userId);
        return;
      }
      // 🗺️ ลูกค้าส่งลิงก์ Google Maps (ปักหมุด) → ดึงพิกัด + คำนวณค่าส่งด่วนให้ (รองรับลิงก์ไม่มี https://)
      if (/(?:https?:\/\/)?[^\s]*(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google)/i.test(t)) {
        const ll = await resolveMapLink(t);
        if (ll) {
          const { km, fee } = riderFee(ll.lat, ll.lng);
          try { if (env.CONV) await env.CONV.put("exp:" + shopId + ":" + userId, JSON.stringify({ fee, km, t: Date.now() }), { expirationTtl: 7200 }); } catch (e) {}
          await lineReply(TOKEN, replyToken, "เช็คค่าส่งด่วนจากหมุดที่ส่งมาแล้วนะคะ 🛵💨\nระยะทางประมาณ " + km + " กม. → ค่าส่งด่วนประมาณ " + fee + " บาทค่ะ\n(เป็นราคาประมาณ อาจปรับตามรอบ/สภาพจราจร) รับแบบส่งด่วนไหมคะ 💕\n\nหรือรับแบบพัสดุปกติ ค่าส่ง 40 บาท ได้รับใน 2-3 วันค่ะ 📦", userId);
        } else {
          await lineReply(TOKEN, replyToken, "ขออภัยค่ะ อ่านพิกัดจากลิงก์นี้ไม่ได้ 🙏🏻 รบกวนกดปุ่ม + ในแชท → เลือก 'ตำแหน่งที่ตั้ง' → ปักหมุดจุดจัดส่ง → กดส่ง มาอีกครั้งนะคะ เดี๋ยวคำนวณค่าส่งด่วนให้ค่ะ 🛵", userId);
        }
        return;
      }
      // 🔧 วิธีใช้ / ปัญหาการใช้งาน — โค้ดตอบเอง (โมเดลมักปฏิเสธการสอนใช้ผลิตภัณฑ์ยาสูบ → จีทูเงียบ)
      if (/^(ใช้ยังไง|ใช้ไง|ใช้งานยังไง)|วิธีใช้|ใช้ยังไงคะ|ใช้ยังไงครับ|สูบยังไง|ดูดยังไง|ชาร์จ|เปลี่ยนหัว|ใส่หัว|ถอดหัว|เปิดเครื่องยังไง|ไฟกระพริบ|ไม่มีควัน|ดูดไม่ติด|ดูดไม่ออก|เครื่องไม่ทำงาน|ใช้ไม่ได้/i.test(t)) {
        await lineReply(TOKEN, replyToken,
          "วิธีใช้งานเบื้องต้นค่ะ 💕\n\n" +
          "🔹 แบบใช้แล้วทิ้ง (พอตทิ้ง) — แกะออกมาดูดได้เลย ไม่ต้องชาร์จ ไม่ต้องเติมน้ำยา หมดแล้วทิ้ง\n" +
          "🔹 แบบเครื่อง + หัวพอต — เสียบหัวพอตเข้ากับเครื่องให้แน่น (จะมีแม่เหล็กหรือล็อกในตัว) แล้วดูดได้เลย หัวหมดก็เปลี่ยนหัวใหม่\n" +
          "🔹 การชาร์จ — ใช้สาย Type-C ชาร์จจนไฟเต็ม (ประมาณ 30-60 นาที) แนะนำไม่ชาร์จข้ามคืนนะคะ\n\n" +
          "⚠️ ถ้าดูดแล้วไม่มีควัน/ไฟกระพริบ ลอง: ถอดหัวออกแล้วใส่ใหม่ให้แน่น · เช็ดขั้วสัมผัสให้แห้ง · ชาร์จไฟให้เต็ม\n\n" +
          "ถ้ายังใช้ไม่ได้ แจ้งรุ่นที่ใช้มาได้เลยค่ะ เดี๋ยวแอดมินดูแลให้นะคะ 🙏🏻", userId);
        return;
      }
      // 🟡 นิโคตินเพ้า (Nicotine Pouch) — ซองอมเหงือก คนละอย่างกับพอต (ต้องเช็คก่อนบล็อกสุขภาพ)
      if (/นิโคติ[น้ิ]*\s*เพ[้า]*า?|นิโคตินพัช|นิค\s*เพ้า|เพ้า|\bpouch\b|ซองอม|อมเหงือก|kardinal|คาร์ดินอล|\bzyn\b|\bzar\b/i.test(t)) {
        await lineReply(TOKEN, replyToken,
          "นิโคตินเพ้า (Nicotine Pouch) คือซองนิโคตินแบบ \"อม\" ค่ะ 💕\n" +
          "สอดไว้ใต้ริมฝีปากบน ระหว่างเหงือกกับริมฝีปาก อมได้ประมาณ 20-40 นาทีแล้วทิ้ง\n" +
          "ไม่มีควัน ไม่มีไอ ไม่ต้องสูบ ไม่ต้องชาร์จ ใช้ได้ในที่ที่สูบไม่ได้ค่ะ ✨\n\n" +
          "📌 ร้านเรามี 3 ยี่ห้อ (ราคาต่อกระปุก)\n" +
          "🔹 KARDINAL — 199 บาท | 3 mg / 6 mg\n   กลิ่น: บลูเบอร์รี่ซิตรัส · โคล่า · ไอซ์มินต์ · มะม่วง · เปปเปอร์มินต์\n" +
          "🔹 ZAR — 199 บาท | 3 mg / 6 mg\n   กลิ่น: ซิตรัส · โคล่า · เฟรชมินต์ · เลมอนครัช · แตงโม\n" +
          "🔹 ZYN — 179 บาท | 1.5 mg / 3 mg / 6 mg\n   กลิ่น: สเปียร์มินต์ · พีช · กาแฟ · คูลมินต์\n\n" +
          "⚠️ มีนิโคติน จำหน่ายเฉพาะผู้มีอายุ 20 ปีขึ้นไปนะคะ\n\n" +
          "สนใจยี่ห้อไหน กลิ่นอะไร ความแรงกี่ mg ดีคะ 💕", userId);
        return;
      }
      // 🚬 คำถามเรื่องนิโคติน/สุขภาพ/สารในตัวสินค้า — โค้ดตอบเอง (โมเดลมักปฏิเสธ → จีทูเงียบ)
      if (/นิโคติน|nicotine|สารเสพติด|อันตรายไหม|อันตรายมั้ย|เป็นมะเร็ง|มะเร็ง|ปอด|สุขภาพ|ติดไหม|ติดมั้ย|กี่\s*mg|กี่มก|ความเข้มข้น|เพียวไหม/i.test(t)) {
        await lineReply(TOKEN, replyToken,
          "สินค้าในร้านเป็นพอตนิโคตินซอลต์ ความเข้มข้นประมาณ 3-5% (30-50 mg/ml) แล้วแต่รุ่นค่ะ 💕\n\n" +
          "⚠️ ผลิตภัณฑ์มีนิโคติน ซึ่งเป็นสารเสพติด — จำหน่ายเฉพาะผู้ที่มีอายุ 20 ปีขึ้นไป และไม่แนะนำสำหรับผู้ไม่เคยสูบบุหรี่ สตรีมีครรภ์ หรือผู้มีโรคประจำตัวนะคะ\n\n" +
          "ถ้าอยากทราบข้อมูลด้านสุขภาพโดยละเอียด แนะนำปรึกษาแพทย์หรือเภสัชกรโดยตรงค่ะ 🙏🏻\n\nสนใจรุ่นไหนเป็นพิเศษไหมคะ แอดมินแนะนำให้ได้เลยค่ะ ✨", userId);
        return;
      }
      // ⚖️ คำถามข้อกฎหมาย/ความเสี่ยง — โค้ดตอบเอง (โมเดล AI มักปฏิเสธ ทำให้ขึ้น "ระบบขัดข้อง")
      if (/โดนจับ|ผิดกฎหมาย|ถูกกฎหมาย|กฎหมาย|ตำรวจ|โดนปรับ|ติดคุก|จับได้|ของผิด|เถื่อน/.test(t)) {
        await muteNow("ถามเรื่องข้อกฎหมาย ⚖️", t);
        await lineReply(TOKEN, replyToken, "ขออภัยด้วยนะคะ 🙏🏻 เรื่องข้อกฎหมายแอดมินไม่สามารถให้คำแนะนำได้ค่ะ\nรบกวนศึกษาข้อมูลจากหน่วยงานที่เกี่ยวข้องโดยตรงนะคะ\n\nถ้ามีคำถามเรื่องสินค้าหรือการสั่งซื้อ ยินดีให้บริการค่ะ 💕 (เดี๋ยวแอดมินเข้ามาดูแลต่อนะคะ)", userId);
        return;
      }
      // 💾 ลูกค้าเก่าพิมพ์ "ที่เดิม" หลังชำระเงิน → ปิดออเดอร์ด้วยที่อยู่ที่บันทึกไว้ (โค้ดจัดการเอง)
      if (/^(ที่เดิม|ส่งที่เดิม|ใช้ที่เดิม|ที่อยู่เดิม)[\s!.ค่ะครับ]*$/.test(t) && env.CONV) {
        try {
          const cv = await env.CONV.get("cust:" + shopId + ":" + userId);
          const ov = await env.CONV.get("ord:" + shopId + ":" + userId);
          if (cv && ov) {
            const c = JSON.parse(cv), o = JSON.parse(ov);
            if (c.addr && o.status && o.status.indexOf("✅") !== -1) {
              // เติมที่อยู่ลงออเดอร์ + ตั้งสถานะพร้อมจัดส่ง
              o.block = (o.block || "").replace(/\nที่อยู่: \(รอลูกค้าแจ้งหลังโอน\)/, "") + "\nชื่อผู้รับ: " + (c.name || "-") + "\nเบอร์: " + (c.tel || "-") + "\nที่อยู่: " + c.addr + "\nชำระ: โอน (ตรวจสลิปผ่านแล้ว ✅)";
              o.status = "ชำระแล้ว ✅ (พร้อมจัดส่ง)";
              await env.CONV.put("ord:" + shopId + ":" + userId, JSON.stringify(o), { expirationTtl: 259200 });
              await lineReply(TOKEN, replyToken, "รับทราบค่ะ ส่งที่เดิมนะคะ 📍\n" + (c.name ? c.name + " " : "") + (c.tel ? c.tel + "\n" : "") + c.addr + "\n\nแอดมินลงออเดอร์ให้เรียบร้อยค่ะ 🎉 จะได้รับสินค้าภายใน 2-3 วันนะคะ ขอบคุณที่อุดหนุนค่ะ 💕", userId);
              return;
            }
          }
        } catch (e) {}
        // ไม่มีข้อมูล/ยังไม่จ่าย → ปล่อยให้ AI ตอบตามปกติ
      }
      // 🛵 ลูกค้าพูดถึงส่งด่วน/คิดค่าส่ง (โค้ดตอบเอง ไม่ผ่าน AI — กัน AI กุข้อมูล/ส่งต่อแอดมินผิดๆ)
      // "แกร็บ / ไรเดอร์ / ส่งด่วน / เมสเซนเจอร์" = บริการเดียวกันของร้าน — ต้องรับเรื่อง ห้ามปฏิเสธว่าไม่มีบริการ
      if (/แกร?[็ๆ]?[บป]|grab|ไรเดอร์|rider|มอเตอร์ไซค์|วินมอไซ|เมสเซนเจอร์|messenger|ลาลามูฟ|lalamove/i.test(t)
          || /^(ส่งด่วน|เอาส่งด่วน|ด่วน|คิดค่าส่ง|เช็คค่าส่ง|คิดค่าส่งด่วน|เช็คค่าส่งด่วน|ค่าส่งด่วน)[\s!.?]*$/.test(t)) {
        let exp = null;
        try { if (env.CONV) { const ex = await env.CONV.get("exp:" + shopId + ":" + userId); if (ex) exp = JSON.parse(ex); } } catch (e) {}
        if (exp && typeof exp.fee === "number") {
          await lineReply(TOKEN, replyToken, "จากหมุดที่ส่งมา ค่าส่งด่วนประมาณ " + exp.fee + " บาทค่ะ (ระยะทาง ~" + exp.km + " กม.) 🛵\nรับสินค้ารุ่นไหน กลิ่นอะไร กี่ชิ้นดีคะ 💕", userId);
        } else {
          await lineReply(TOKEN, replyToken, "ได้เลยค่ะ 🛵 รบกวนแชร์โลเคชั่น (ปักหมุด) จุดจัดส่งมาให้หน่อยนะคะ\n(กดปุ่ม + ในแชท → 'ตำแหน่งที่ตั้ง' → ปักหมุด → ส่ง หรือส่งลิงก์ Google Maps มาก็ได้ค่ะ)\nเดี๋ยวระบบคำนวณค่าส่งด่วนให้ทันทีค่ะ 💕", userId);
        }
        return;
      }
      // ลูกค้าเปลี่ยนใจเป็นพัสดุปกติ → ล้างค่าส่งด่วนที่จำไว้
      if (/พัสดุปกติ|ส่งธรรมดา|ส่งปกติ|แบบพัสดุ|เอาพัสดุ|ไม่เอาส่งด่วน|flash|แฟลช/i.test(t)) {
        try { if (env.CONV) await env.CONV.delete("exp:" + shopId + ":" + userId); } catch (e) {}
        await lineReply(TOKEN, replyToken, "รับแบบพัสดุปกติ ค่าส่ง 40 บาท ได้รับภายใน 2-3 วันค่ะ 📦 (ซื้อครบโปรส่งฟรีได้ด้วยนะคะ) รับกลิ่นไหน กี่ชิ้นดีคะ 💕", userId);
        return;
      }
      if (/รูปแบบการจัดส่ง|วิธีการจัดส่ง|การจัดส่ง|ค่าส่งเท่าไหร่|ค่าจัดส่ง|ส่งยังไง|จัดส่งยังไง|ส่งแบบไหน/.test(t)) {
        await lineReply(TOKEN, replyToken, SHIP_MSG, userId);
        return;
      }
      if (/เมนู|มีอะไรบ้าง|มีอะไรมั่ง|มีพอตอะไร|มีบุหรี่อะไร|มีของอะไร|รายการสินค้า|ขอดูสินค้า|ดูสินค้า/.test(t)) {
        await lineReply(TOKEN, replyToken, MENU_MSG, userId);
        return;
      }
    }

    // โหลดประวัติแชท (ถ้ามี KV)
    // 🌏 ภาษาที่ลูกค้าใช้ (จำไว้ทั้งบทสนทนา) — คนไทยได้ข้อความไทยเหมือนเดิมทุกอย่าง
    let LANG = "th";
    try {
      if (env.CONV) {
        const saved = await env.CONV.get("lang:" + shopId + ":" + userId);
        if (saved) LANG = saved;
        const d = detectLang(ev.message && ev.message.text ? ev.message.text : "");
        if (d && d !== LANG) { LANG = d; await env.CONV.put("lang:" + shopId + ":" + userId, d, { expirationTtl: 604800 }); }
      }
    } catch (e) {}
    const key = `conv3:${shopId}:${userId}`; // conv3 = ล้างความจำที่ปนเปื้อนจากตอน V3.2 (ตอบมั่ว/จับรุ่นผิด)
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

    // 💬 โชว์ "จุดกำลังพิมพ์" (loading animation) ให้ลูกค้าเห็นระหว่างจีทูคิดคำตอบ
    await lineLoading(TOKEN, userId);

    // ⛔ รายชื่อรุ่นที่หมดสต็อกทั้งรุ่น (ทุกกลิ่นเหลือ 0) → ห้ามจีทูเอาไปแนะนำ
    let outNote = "";
    try {
      if (env.CONV) {
        const smAll = fixStockNames(JSON.parse((await env.CONV.get("stockmap")) || "{}"));
        const tot = {};
        for (const nm in smAll) { const pre = nm.split(" - ")[0]; tot[pre] = (tot[pre] || 0) + (smAll[nm] > 0 ? smAll[nm] : 0); }
        const outs = Object.keys(tot).filter(p => tot[p] === 0);
        if (outs.length) outNote = "\n\n# ⛔⛔ รุ่นที่หมดสต็อกตอนนี้ (ทุกกลิ่นเหลือ 0) — ทั้ง 'ห้ามแนะนำ' และ 'ห้ามรับออเดอร์'\nรุ่นในลิสต์นี้: (1) ห้ามเอาไปแนะนำ/เสนอ (2) ถ้าลูกค้าสั่งรุ่นนี้ ⛔ ห้ามออกบล็อกทวนคำสั่งซื้อ/สรุปยอดเด็ดขาด ให้ตอบว่า 'ขออภัยค่ะ รุ่นนี้ของหมด/รอของเข้าอยู่นะคะ 🙏🏻 เดี๋ยวแอดมินแจ้งอีกครั้งค่ะ' แล้วเสนอรุ่นที่มีของแทน:\n" + outs.join(", ");
      }
    } catch (e) {}
    // 💾 ลูกค้าเก่า → บอก AI ว่ามีที่อยู่บันทึกไว้ (ให้เสนอ "ส่งที่เดิม" ได้)
    let custNote = "";
    try {
      if (env.CONV) {
        const cv = await env.CONV.get("cust:" + shopId + ":" + userId);
        if (cv) { const c = JSON.parse(cv); if (c && c.addr) custNote = "\n\n# ลูกค้าคนนี้เป็นลูกค้าเก่า เคยสั่งซื้อสำเร็จแล้ว\n- ชื่อ: " + (c.name || "-") + " เบอร์: " + (c.tel || "-") + "\n- ที่อยู่ที่เคยส่ง: " + c.addr + "\n→ ตอนขอที่อยู่ ให้ถามว่า \"ส่งที่เดิมไหมคะ\" ก่อน (ลูกค้าพิมพ์ 'ที่เดิม' ระบบจัดการให้เอง) ⛔ ห้ามเอาที่อยู่ไปพูดถึงโดยไม่จำเป็น"; }
      }
    } catch (e) {}
    const sysFull = sysPrompt + outNote + custNote;

    let reply, userForHistory;

    if (mtype === "image") {
      // ── ลูกค้าส่งรูป (มักเป็นเมนูที่วงกลมสินค้า) → ให้ AI อ่านรูป ──
      const dataUri = await getLineImage(ev.message.id, TOKEN);
      if (!dataUri) {
        await lineReply(TOKEN, replyToken, "ขออภัยค่ะ รูปโหลดไม่ได้ 🙏🏻 รบกวนพิมพ์ชื่อรุ่น/กลิ่นที่ต้องการมาได้เลยนะคะ", userId);
        return;
      }
      const visionMsg = {
        role: "user",
        content: [
          { type: "text", text:
"ลูกค้าส่งรูปนี้มา\n\n" +
"ขั้นที่ 1 — จำแนกรูป:\n" +
"• ถ้าเป็นสลิปโอนเงิน (โลโก้ธนาคาร ยอดเงิน วันเวลา เลขอ้างอิง) → ตอบคำเดียวว่า [SLIP] ห้ามพิมพ์อย่างอื่น\n" +
"• ถ้าเป็นรูปเมนู/แคตตาล็อกสินค้าของร้าน → ทำตามขั้นที่ 2\n\n" +
"ขั้นที่ 2 — อ่านเมนูที่ลูกค้าวงไว้ (สำคัญมาก):\n" +
"เมนูของร้านเป็นภาพแคตตาล็อก จัดวางแบบนี้: ด้านบนของบล็อกคือ 'ชื่อรุ่น/ยี่ห้อ + ราคา' (เช่น KARDINAL 199.- , MARBO 9K 290.-) และด้านล่างเป็นกล่องสินค้าเรียงกันหลายกล่อง แต่ละกล่องคือ 'กลิ่น/สี' หนึ่งอัน (ชื่อกลิ่นเขียนอยู่บนกล่องหรือใต้กล่อง) บางเมนูมีตัวเลขความแรง mg กำกับด้านซ้ายของแถว\n\n" +
"ให้ทำตามนี้:\n" +
"1) หาเครื่องหมายที่ลูกค้าทำไว้ — วงกลมแดง กรอบแดง ลูกศร ขีดเส้น ไฮไลต์ ติ๊กถูก หรือวงด้วยสีอื่น\n" +
"2) อ่าน 'ชื่อกลิ่น' ที่อยู่ในกล่องที่ถูกวง + ไล่ขึ้นไปดูหัวข้อด้านบนว่าเป็นรุ่นอะไร (ถ้ามีตัวเลข mg ให้ระบุด้วย)\n" +
"3) ถ้าวงไว้หลายอัน ต้องลิสต์ให้ครบทุกอันที่วง ห้ามตอบแค่อันเดียว\n" +
"4) ทวนกลับให้ลูกค้าแบบนี้: \"รับ <ชื่อรุ่น> กลิ่น <ชื่อกลิ่น> ใช่ไหมคะ\" แล้วถามจำนวนต่อ\n" +
"5) ⛔ ห้ามเดา ถ้าอ่านชื่อกลิ่นไม่ออก/รูปเบลอ/ไม่เห็นว่าวงตรงไหน → ถามกลับตรงๆ ว่า \"รบกวนพิมพ์ชื่อรุ่นกับกลิ่นที่ต้องการมาอีกครั้งนะคะ 🙏🏻\" ห้ามมั่วชื่อรุ่นยอดฮิตเด็ดขาด\n" +
"6) ⛔ ราคาให้ยึดจาก 'รายการสินค้า' ในระบบเท่านั้น ห้ามอ่านราคาจากรูปมาใช้ และห้ามพิมพ์ยอดรวม (ระบบคิดเงินเอง)\n" +
"7) ถ้ารูปไม่มีการวง/ทำเครื่องหมายเลย → ถามว่า \"สนใจรุ่นไหนในภาพคะ 💕 บอกชื่อรุ่นกับกลิ่นมาได้เลยนะคะ\"" },
          { type: "image_url", image_url: { url: dataUri } }
        ]
      };
      reply = await askAI(env.OPENROUTER_KEY, [{ role: "system", content: sysFull }, ...history.slice(-8), visionMsg], VISION_MODELS);
      if (reply.indexOf("[SLIP]") !== -1) {
        // เป็นสลิปโอนเงิน → ตรวจกับ SlipOK แล้วเทียบยอดกับออเดอร์
        // ✅ สลิปผ่าน  → จีทูขอที่อยู่จัดส่งต่อ (ไม่มิ้วต์) แล้วค่อยสรุปออเดอร์
        // ⛔ สลิปมีปัญหา → มิ้วต์ ส่งต่อแอดมิน
        const ordKey = "ord:" + shopId + ":" + userId;
        let expected = 0, ordObj = null;
        try {
          const ok = await env.CONV.get(ordKey);
          if (ok) { ordObj = JSON.parse(ok); const m = (ordObj.block || "").match(/(?:รวมยอดชำระ|ยอดรวม)[:\s]*([\d,]+)/); if (m) expected = +m[1].replace(/,/g, ""); }
        } catch (e) {}

        // 💾 ลูกค้าเก่ามีที่อยู่บันทึกไว้ → เสนอ "ส่งที่เดิม" แทนฟอร์มเต็ม
        let ADDR_FORM = "\n\nรบกวนขอที่อยู่จัดส่งให้ครบตามนี้นะคะ 📍\nชื่อผู้รับ :\nบ้านเลขที่ :\nซอย / หมู่ :\nตำบล / แขวง :\nอำเภอ / เขต :\nจังหวัด :\nเลขไปรษณีย์ :\nเบอร์โทรศัพท์ :\nเพื่อไม่ให้เกิดข้อผิดพลาดในการจัดส่งค่ะ 🙏🏻💕";
        try {
          const cv = await env.CONV.get("cust:" + shopId + ":" + userId);
          if (cv) {
            const c = JSON.parse(cv);
            if (c && c.addr) ADDR_FORM = "\n\n📍 ส่งที่เดิมไหมคะ?\n" + (c.name ? "ชื่อผู้รับ: " + c.name + "\n" : "") + (c.tel ? "เบอร์: " + c.tel + "\n" : "") + "ที่อยู่: " + c.addr + "\n\nพิมพ์ \"ที่เดิม\" ได้เลยค่ะ หรือส่งที่อยู่ใหม่มาก็ได้นะคะ 💕";
          }
        } catch (e) {}

        let statusLine = "ส่งสลิปแล้ว รอตรวจยอด 🧾";
        let customerMsg = "ได้รับสลิปแล้วค่ะ 🙏🏻 รอแอดมินตรวจสอบและยืนยันอีกครั้งนะคะ ขอบคุณค่ะ 💕";
        let slipPassed = false;
        try {
          const sok = await checkSlip(env, TOKEN, ev.message.id);
          if (sok) {
            const d = sok.data || {};
            if (sok.httpOk && sok.success && d.success) {
              const slipAmt = Math.round((+d.amount || 0) * 100) / 100;
              const recv = (d.receiver && (d.receiver.displayName || d.receiver.name)) || "";
              if (!expected) {
                slipPassed = true;
                statusLine = "ชำระแล้ว ✅ ยอด " + slipAmt + " บาท → " + recv + " (รอที่อยู่จัดส่ง)";
                customerMsg = "✅ สลิปถูกต้อง จำนวนเงิน " + slipAmt + " บาท เข้าบัญชีร้านเรียบร้อยค่ะ 🎉 ขอบคุณที่อุดหนุนนะคะ 💕" + ADDR_FORM;
              } else if (Math.abs(slipAmt - expected) <= 1) {
                slipPassed = true;
                statusLine = "ชำระแล้ว ✅ ยอด " + slipAmt + " ตรงออเดอร์ → " + recv + " (รอที่อยู่จัดส่ง)";
                customerMsg = "✅ สลิปถูกต้อง จำนวนเงิน " + slipAmt + " บาท ตรงกับยอดออเดอร์เรียบร้อยค่ะ 🎉 ขอบคุณที่อุดหนุนนะคะ 💕" + ADDR_FORM;
              } else {
                statusLine = "⚠️ ยอดไม่ตรง: สลิป " + slipAmt + " / ออเดอร์ " + expected + " → " + recv + " — แอดมินเช็คด่วน";
                customerMsg = "⚠️ ตรวจสอบสลิปแล้วนะคะ\nยอดในสลิป " + slipAmt + " บาท แต่ยอดออเดอร์คือ " + expected + " บาท ไม่ตรงกันค่ะ 🙏🏻\nรบกวนเช็คอีกครั้ง เดี๋ยวแอดมินเข้ามาดูแลให้นะคะ";
              }
            } else {
              const msg = (sok.data && sok.data.message) || sok.message || "ตรวจสอบไม่ผ่าน";
              const m = String(msg);
              const code = sok.code || (sok.data && sok.data.code) || 0;
              statusLine = "⛔ สลิปมีปัญหา (code " + code + "): " + m.slice(0, 60) + " — แอดมินเช็คด่วน";
              if (code === 1012 || /ซ้ำ|duplicate|เคย|ตรวจสอบแล้ว|ตรวจแล้ว|already|used/i.test(m)) {
                // สลิปซ้ำ = โอนถูกแล้ว แต่ส่งสลิปใบเดิมที่เคยตรวจไปแล้ว → ส่งต่อแอดมินยืนยัน (ไม่โทษลูกค้า)
                statusLine = "⚠️ สลิปนี้เคยตรวจแล้ว (อาจส่งซ้ำ) — แอดมินยืนยันด่วน";
                customerMsg = "✅ ได้รับสลิปแล้วนะคะ 🙏🏻 ระบบตรวจพบว่าสลิปนี้เคยส่งเข้ามาแล้ว เดี๋ยวแอดมินเช็คและยืนยันการชำระให้อีกครั้งค่ะ 💕";
              } else if (code === 1010 || /บัญชี.*ไม่ตรง|ไม่ตรง.*บัญชี|ผู้รับ|receiver/i.test(m)) {
                customerMsg = "⚠️ ตรวจสอบสลิปแล้ว บัญชีผู้รับไม่ตรงกับบัญชีของร้านนะคะ 🙏🏻\nรบกวนตรวจสอบว่าโอนเข้าบัญชีที่ถูกต้องไหมคะ เดี๋ยวแอดมินเข้ามาดูแลค่ะ";
              } else {
                // อื่นๆ (QR อ่านไม่ได้/สลิปไม่รองรับ/ระบบล่ม) → ส่งต่อแอดมิน ไม่โทษว่าสลิปไม่ชัด
                customerMsg = "🙏🏻 ได้รับสลิปแล้วนะคะ ระบบตรวจอัตโนมัติไม่สำเร็จ เดี๋ยวแอดมินเข้ามาตรวจสอบและยืนยันการชำระให้อีกครั้งค่ะ 💕";
              }
            }
          }
        } catch (e) {}

        // อัพสถานะออเดอร์ให้แอดมินเห็นผลตรวจ
        try { if (ordObj) { ordObj.status = statusLine; await env.CONV.put(ordKey, JSON.stringify(ordObj), { expirationTtl: 259200 }); } } catch (e) {}

        if (slipPassed) {
          // ชำระผ่าน → จีทูขอที่อยู่ต่อ (ไม่มิ้วต์) + จดประวัติว่าชำระแล้ว เพื่อให้จีทูรู้ว่าต้องขอที่อยู่แล้วสรุปออเดอร์
          try {
            if (env.CONV) {
              const next = [...history, { role: "user", content: "[ลูกค้าส่งสลิปโอนเงิน — ตรวจสอบแล้วชำระเงินถูกต้อง]" }, { role: "assistant", content: "ยืนยันการชำระเงินเรียบร้อยค่ะ กำลังขอที่อยู่จัดส่งจากลูกค้า" }].slice(-20);
              await env.CONV.put(key, JSON.stringify(next), { expirationTtl: 3600 });
            }
          } catch (e) {}
          await lineReply(TOKEN, replyToken, customerMsg, userId);
          return;
        }

        // สลิปมีปัญหา → มิ้วต์ ส่งต่อแอดมิน
        await muteNow(statusLine, "[ลูกค้าส่งสลิปโอนเงิน — สลิปมีปัญหา]");
        await lineReply(TOKEN, replyToken, customerMsg, userId);
        return;
      }
      userForHistory = { role: "user", content: "[ลูกค้าส่งรูปเมนู/สินค้าที่วงกลมไว้]" };
    } else {
      // ── ข้อความปกติ ──
      const text = ev.message.text.trim();
      // 🔍 เช็คสต็อกจริง (จาก XSelly webhook) เฉพาะรายการที่เกี่ยวกับข้อความลูกค้า
      let stockNote = "";
      try {
        if (env.CONV) {
          const sm = fixStockNames(JSON.parse((await env.CONV.get("stockmap")) || "{}"));
          const names = Object.keys(sm);
          if (names.length) {
            // จับคู่แบบกลับด้าน: เอาคำในชื่อสินค้าไปหาในข้อความลูกค้า (รองรับพิมพ์ติดกันเช่น "แล้วmarboหละ")
            // + แปลงคำทับศัพท์ไทย → อังกฤษ ก่อนจับคู่ (มาโบ→marbo ฯลฯ)
            const ALIAS = { "มาโบ": " marbo ", "มาร์โบ": " marbo ", "สตาร์": " star ", "เรลซ์": " relx ", "รีแลค": " relx ", "รีแล็กซ์": " relx ", "อินฟี่": " infy ", "อินฟาย": " infy ", "เอสโค": " esko ", "เอลฟ์บาร์": " elfbar ", "โซนิค": " sonic ", "วีพลัส": " v plus ", "ดูอัล": " dual smash ", "จอยเวย์": " joiway ", "เคเอส": " ks ", "ควิก": " quik ", "ลาน่า": " lana ", "คาร์นิวัล": " carnival ", "ไอคอส": " iqos " };
            // รวมข้อความก่อนหน้าของลูกค้าด้วย เผื่อพิมพ์ต่อเนื่อง เช่น "abc 8k" แล้วตามด้วย "เอาองุ่น1"
            const prevUser = history.filter(h => h.role === "user" && typeof h.content === "string").slice(-2).map(h => h.content).join(" ");
            let textLow = (prevUser + " " + text).toLowerCase();
            for (const th in ALIAS) textLow = textLow.split(th).join(ALIAS[th]);
            // ให้คะแนนแต่ละรายการ = จำนวน "คำในชื่อสินค้า" ที่ปรากฏในข้อความลูกค้า (ยิ่งตรงหลายคำ = ตรงรุ่น+กลิ่นมากสุด)
            let scored = [];
            for (const nm of names) {
              const ntoks = nm.toLowerCase().split(/[^a-z0-9ก-๙%]+/).filter(w => w.length >= 3);
              let score = 0;
              for (const t of ntoks) if (textLow.includes(t)) score++;
              if (score > 0) scored.push({ nm, score });
            }
            if (scored.length) {
              const maxScore = Math.max.apply(null, scored.map(x => x.score));
              // ถ้ามีรายการที่ตรง ≥2 คำ (ตรงทั้งรุ่น+กลิ่น) → เอาเฉพาะพวกที่ตรงมากสุด ตัดพวกตรงคำเดียวที่รกทิ้ง
              const keep = maxScore >= 2 ? scored.filter(x => x.score >= 2) : scored;
              keep.sort((a, b) => b.score - a.score);
              const hit = keep.slice(0, 12).map(x => x.nm);
              stockNote = "\n\n# สต็อกจริงตอนนี้ (ข้อมูลภายใน — อัพเดตอัตโนมัติจากคลัง เชื่อข้อมูลนี้เหนือกว่ารายการสินค้า)\n" +
                hit.map(nm => "- " + nm + ": " + (sm[nm] > 0 ? "มีของ (จำนวนภายใน " + sm[nm] + " — ห้ามบอกลูกค้า)" : "❌ หมด")).join("\n") +
                "\nกติกา: อ่านชื่อรุ่น+กลิ่นในแต่ละบรรทัดให้ตรงเป๊ะ ⛔ ห้ามเอาสถานะ (มีของ/หมด) ของรุ่นหรือกลิ่นหนึ่งไปตอบแทนอีกอันเด็ดขาด — เช่น 'MARBO 9K - องุ่น' กับ 'MARBO 9K - องุ่นลิ้นจี่' คนละตัวกัน ห้ามกุเอง ถ้ารุ่น/กลิ่นที่ลูกค้าพูดถึงไม่มีในรายการนี้แบบตรงตัว ให้ตอบ 'เดี๋ยวแอดมินเช็คสต็อกและยืนยันให้อีกครั้งนะคะ 🙏🏻' ถ้ากลิ่นที่ลูกค้าสั่งหมด ให้แจ้งว่าหมดชั่วคราวและแนะนำกลิ่นที่ยังมีของแทน\n⛔⛔ ความลับบริษัท: 'จำนวนภายใน' ใช้เช็คว่าพอส่งไหมเท่านั้น ห้ามบอกตัวเลขจำนวนสต็อกให้ลูกค้าเด็ดขาด — ตอบได้แค่ 'กลิ่นนี้มีค่ะ' / 'กลิ่นนี้หมดค่ะ' ถ้าลูกค้าถามว่ามีกี่ชิ้น/เหลือเท่าไหร่ ตอบว่า 'มีพร้อมส่งค่ะ 💕' (ถ้าเหลือน้อยกว่าที่ลูกค้าจะสั่ง ให้บอกว่า 'ตอนนี้มีจำนวนจำกัด เดี๋ยวแอดมินเช็คให้อีกครั้งนะคะ' โดยไม่บอกตัวเลข)";
            }
          }
        }
      } catch (e) {}
      // ส่งสต็อกจริงเข้าไปในตัวใบ้กลิ่นด้วย จีทูจะได้ลิสต์เฉพาะกลิ่นที่มีของ
      let smForHint = null, bufForHint = 1;
      try {
        if (env.CONV) {
          smForHint = fixStockNames(JSON.parse((await env.CONV.get("stockmap")) || "{}"));
          bufForHint = parseInt((await env.CONV.get("stockbuffer")) || "1", 10);
        }
      } catch (e) {}
      const hint = aliasHint(text) + flavorHint(text, smForHint, bufForHint);
      const langRule = LANG === "th" ? "" : ("\n\n# 🌏 ภาษาที่ต้องใช้ตอบ\nลูกค้าคนนี้ใช้ " + (LANG_NAME[LANG] || LANG) + " → **ตอบเป็นภาษานั้นทั้งหมด** ทุกข้อความ ห้ามตอบภาษาไทย\nชื่อรุ่นสินค้าคงเป็นภาษาอังกฤษตามเดิม ราคาบอกเป็นบาท (THB)\nยังคงใช้กฎทุกข้อเหมือนเดิม (ห้ามคิดเลขเอง ห้ามลดราคา ห้ามบอกจำนวนสต็อก)\n⛔ บล็อก \"ทวนคำสั่งซื้อ\" ให้พิมพ์หัวข้อเป็นภาษาไทยเหมือนเดิมเสมอ (ระบบใช้จับ) ส่วนข้อความอื่นเป็นภาษาลูกค้า");
      reply = await askAI(env.OPENROUTER_KEY, [{ role: "system", content: sysFull + stockNote + langRule }, ...history.slice(-10), { role: "user", content: text + hint }]);
      userForHistory = { role: "user", content: text };
    }

    // 🛡 กันจีทูแจกของแถม/เลขบัญชีเอง (ระบบเป็นคนออกการ์ดของแถม + การ์ดชำระเงินเท่านั้น)
    try {
      // 1) ห้ามแจ้งเลขบัญชีเองก่อนลูกค้ากดยืนยัน — ตัดบรรทัดที่มีเลขบัญชีของร้านออก
      if (payInfo) {
        const acct = (payInfo.match(/\d[\d\- ]{7,}\d/g) || []).map(x => x.replace(/[^0-9]/g, ""));
        if (acct.length && acct.some(a => reply.replace(/[^0-9]/g, "").indexOf(a) !== -1)) {
          reply = reply.split("\n").filter(l => !acct.some(a => l.replace(/[^0-9]/g, "").indexOf(a) !== -1) && !/ธนาคาร|เลขบัญชี|ชื่อบัญชี|กสิกร|ไทยพาณิชย์|กรุงเทพ|กรุงไทย/.test(l)).join("\n").trim();
          reply += (reply ? "\n\n" : "") + "กดปุ่ม \"ยืนยันรายการ\" ในการ์ดด้านบนได้เลยค่ะ เดี๋ยวระบบส่งข้อมูลการชำระเงินให้ทันทีนะคะ 💕";
        }
      }
      // 2) ห้ามพูดถึงเครื่องเปล่าแถม ถ้าออเดอร์ไม่ได้เข้าโปร Big Pod จริง (กันกุโปร "ซื้อ 20 แท่งแถม 4 เครื่อง")
      if (/แถม/.test(reply) && /เครื่องเปล่า|เครื่องฟรี|เครื่อง\s*\d+\s*เครื่อง/.test(reply)) {
        const bigWords = /BOOST POD|POD CLEAR|LEGO|TANK|SWAP|SWITCH|VAZER|KS QUIK PRO|DUAL SMASH|KIT|Big ?Pod|บิ๊กพอต|หัวน้ำยา/i;
        if (!bigWords.test(reply)) {
          reply = reply.split("\n")
                       .filter(l => !((/แถม/.test(l) && /เครื่อง/.test(l)) || /เครื่องเปล่า|เครื่องฟรี/.test(l)))
                       .join("\n").replace(/🎁\s*ของแถม:?/g, "").replace(/\n{3,}/g, "\n\n").trim();
        }
      }
    } catch (e) {}

    // ⚡ ส่งคำตอบให้ลูกค้าก่อนเสมอ (ห้ามให้ขั้นตอนบันทึกประวัติมาบล็อกการตอบ)
    // 📦 ถ้าเป็นบล็อกทวนคำสั่งซื้อ → โค้ดคิดเงินเอง + ส่งการ์ด Flex "ยืนยันรายการ"
    let orderStored = false;
    if (reply.indexOf("ทวนคำสั่งซื้อ") !== -1) {
      let items = parseItems(reply);
      // 💰 ลูกค้าขอ "ราคาส่ง" แต่บล็อกเป็น MARBO ของแท้ → เรทส่งมีเฉพาะโคลน ต้องถามก่อน ห้ามออกการ์ดราคาแท้
      try {
        const wantWholesale = /ราคาส่ง|เรทส่ง|ขายส่ง|ราคาขายส่ง|เรทขายส่ง|ยกลัง|ราคายกโหล/.test(
          ((ev.message && ev.message.text) || "") + " " + history.slice(-3).map(h => typeof h.content === "string" ? h.content : "").join(" ")
        );
        const hasRealMarbo = items.some(it => /MARBO\s*9K/i.test(it.model) && !/โคลน|clone|เทียบ/i.test(it.model));
        if (wantWholesale && hasRealMarbo) {
          await lineReply(TOKEN, replyToken,
            "ขอเช็คก่อนนะคะ 🙏🏻 เรทขายส่งของ MARBO 9K มีเฉพาะ **รุ่นโคลน (เทียบแท้)** ค่ะ\n\n" +
            "• MARBO 9K แท้ = 350 บาท/แท่ง (ไม่มีเรทขายส่ง)\n" +
            "• MARBO 9K โคลน = 290 บาท/แท่ง · สั่ง 20 แท่งขึ้นไปได้เรทขายส่ง 250 บาท/แท่ง (ส่งฟรี)\n\n" +
            "คุณลูกค้ารับแบบไหนดีคะ 💕", userId);
          return;
        }
      } catch (e) {}
      // 🧯 กันจีทู "ลอกรายการจากตัวอย่าง/ออเดอร์เก่า": รุ่นในบล็อกต้องเคยโผล่ในบทสนทนานี้จริง
      try {
        // ดูเฉพาะบริบท "สดๆ" (2 เทิร์นล่าสุด + ข้อความนี้ + คำพูดของจีทูในรอบนี้ที่ไม่ใช่บรรทัดรายการ)
        // ⛔ ไม่ดูประวัติเก่ากว่านั้น กันรุ่นจากออเดอร์ก่อนหน้าหลุดเข้ามาในการ์ด
        const replyContext = reply.split("\n").filter(l => l.indexOf("|") === -1).join("\n");
        const convText = history.slice(-4).map(h => typeof h.content === "string" ? h.content : "").join("\n")
          + "\n" + (ev.message && ev.message.text ? ev.message.text : "") + "\n" + replyContext;
        // narrow = สิ่งที่พูดถึง "เดี๋ยวนี้" (ข้อความล่าสุด + คำพูดจีทูรอบนี้) | wide = 2 เทิร์นล่าสุด (เผื่อสั่งเพิ่มทีละอย่าง)
        const narrowText = (ev.message && ev.message.text ? ev.message.text : "") + "\n" + replyContext
          + "\n" + (history.length ? String(history[history.length - 1].content || "") : "");
        const mk = (txt) => { const s = new Set(), n = normTH(txt); for (const k of FLAVOR_KEYS) if (n.indexOf(normTH(k)) !== -1) s.add(normTH(k)); for (const [re, key] of TH_MODEL) if (re.test(txt)) s.add(normTH(key)); return s; };
        const wide = mk(convText), narrow = mk(narrowText);
        const hit = (it, set) => { const m = normTH(it.model); for (const a of set) if (m.indexOf(a) !== -1 || a.indexOf(m) !== -1) return true; return false; };
        if (wide.size) {
          const keep = items.filter(it => hit(it, wide));
          const okNow = narrow.size ? items.some(it => hit(it, narrow)) : true; // ต้องมีอย่างน้อย 1 ตัวที่ตรงกับสิ่งที่คุยกันอยู่ตอนนี้
          if (!keep.length || !okNow) {                                          // มั่ว/ลอกของเก่า → ไม่ออกการ์ด ถามใหม่
            await lineReply(TOKEN, replyToken, L("reAsk", LANG) || "ขออนุญาตทวนอีกครั้งนะคะ 🙏🏻 รบกวนแจ้ง รุ่น + กลิ่น/สี + จำนวน ที่ต้องการอีกทีค่ะ เดี๋ยวสรุปออเดอร์ให้ถูกต้องนะคะ 💕", userId);
            return;
          }
          if (keep.length !== items.length) items = keep;                         // ตัดรายการที่ลูกค้าไม่ได้สั่งทิ้ง
        }
      } catch (e) {}
      // 🛑 กันออกการ์ดก่อนรู้กลิ่น/จำนวนจริง — ถ้าช่องกลิ่นเป็น "คำถาม" (กลิ่นไหน/อะไร/เลือก) หรือจำนวนไม่ชัด → ยังไม่ออกการ์ด ให้ถามก่อน
      const notReady = !items.length || items.some(it => /ไหน|อะไร|\?|เลือก|กี่|ดีคะ|ระบุ|ทั้งหมด|โปรด/.test(it.flavor) || !(it.qty > 0));
      // 🚫 เช็คสต็อกจริงก่อนออกการ์ด — คัดรายการที่หมดออก แล้วไปต่อกับตัวที่มีของ (กันวนซ้ำ)
      let outList = [], okItems = items, staleList = [];
      try {
        if (env.CONV) {
          const smChk = fixStockNames(JSON.parse((await env.CONV.get("stockmap")) || "{}"));
          // 🛡 กันชนสต็อก: เหลือน้อยกว่า/เท่ากับ N ชิ้น = ถือว่าไม่พร้อมขาย (มักเป็นเศษค้างในระบบ ไม่ใช่ของจริง)
          const buf = parseInt((await env.CONV.get("stockbuffer")) || "1", 10);
          // ⏱ กันขายของที่ "ข้อมูลสต็อกเก่าเกินไป" (เปิด/ปิดที่ /stockage?key=...&set=ชั่วโมง | 0 = ปิด)
          const maxAgeH = parseInt((await env.CONV.get("stockmaxage")) || "0", 10);
          const tsMap = maxAgeH ? JSON.parse((await env.CONV.get("stockts")) || "{}") : null;
          const nowT = Date.now();
          okItems = [];
          for (const it of items) {
            if (/แถม|ฟรี/i.test(it.flavor || "")) { okItems.push(it); continue; } // ของแถม ข้าม
            const q = findStockForItem(smChk, it.model, it.flavor);
            if (q !== null && q <= buf) { outList.push(it); continue; }   // เหลือ ≤ กันชน = ถือว่าหมด
            if (maxAgeH && tsMap) { // ข้อมูลว่ามีของ แต่ไม่ได้อัปเดตมานาน → ให้แอดมินเช็คก่อน
              let t = 0;
              for (const nm in tsMap) if (normTH(nm).indexOf(normTH(it.model)) !== -1 && normTH(nm).indexOf(normTH(it.flavor)) !== -1) { t = Math.max(t, tsMap[nm]); }
              if (!t || (nowT - t) / 3600000 > maxAgeH) { staleList.push(it); continue; }
            }
            okItems.push(it);
          }
        }
      } catch (e) { okItems = items; staleList = []; }
      if (staleList.length) { // มีของที่ต้องเช็คก่อน → ไม่ปิดการขายเอง ส่งต่อแอดมิน
        await muteNow("⏱ ต้องเช็คสต็อกก่อนยืนยัน: " + staleList.map(x => x.model + " " + x.flavor).join(", "), (ev.message && ev.message.text) || "");
        await lineReply(TOKEN, replyToken, L("checkStock", LANG) || ("ขอเช็คของให้ก่อนนะคะ 🙏🏻\n" + staleList.map(x => "• " + x.model + " กลิ่น" + x.flavor).join("\n") + "\n\nเดี๋ยวแอดมินยืนยันจำนวนที่มีแล้วสรุปออเดอร์ให้ทันทีค่ะ 💕"), userId);
        return;
      }
      const outOfStock = (okItems.length === 0 && outList.length) ? outList[0] : null;
      const outNote2 = outList.length ? ("ขออภัยค่ะ 🙏🏻 " + outList.map(x => x.model + " กลิ่น" + x.flavor).join(", ") + " หมดชั่วคราวค่ะ (ตัดออกจากรายการให้แล้วนะคะ)\n\n") : "";
      if (okItems.length) items = okItems;
      if (notReady) {
        // ถามให้ตรงรุ่น: เครื่อง = ถามสี/จำนวน | อื่นๆ = ถามกลิ่น/จำนวน
        const m0 = (items[0] && items[0].model) || "";
        // เครื่อง = ถามสี | หัวน้ำยา/พอต = ถามกลิ่น (ดูจากชื่อรุ่นเท่านั้น ห้ามดูจากคำตอบ AI ที่อาจพิมพ์คำว่า "เครื่อง" ปนมา)
        const isDevice = /^เครื่อง/.test(m0.trim()) || /IQOS ILUMA/i.test(m0);
        const askTr = L("askItem", LANG);
        const ask = askTr ? (m0 ? (m0 + " — " + askTr) : askTr) : m0
          ? ("รับ " + m0 + (isDevice ? " สีไหน" : " กลิ่นไหน") + " จำนวนกี่" + (isDevice ? "เครื่อง" : "ชิ้น") + "ดีคะ 💕")
          : "รับรุ่นไหน กลิ่น/สีอะไร จำนวนเท่าไหร่ดีคะ 💕";
        await lineReply(TOKEN, replyToken, ask, userId);
      } else if (outOfStock) {
        await lineReply(TOKEN, replyToken, L("outStock", LANG, outOfStock.model, outOfStock.flavor) || ("ขออภัยค่ะ 🙏🏻 " + outOfStock.model + " กลิ่น" + outOfStock.flavor + " ตอนนี้หมดชั่วคราวค่ะ\nรบกวนเลือกกลิ่นอื่น หรือให้แอดมินแนะนำกลิ่นที่มีของแทนไหมคะ 💕"), userId);
      } else if (items.length) {
        // ถ้าลูกค้าเลือกส่งด่วน (มี exp: จากการปักหมุด) → ใช้ค่าส่งด่วนในการ์ด
        let expFee = null;
        try { if (env.CONV) { const ex = await env.CONV.get("exp:" + shopId + ":" + userId); if (ex) { const ej = JSON.parse(ex); if (ej && typeof ej.fee === "number") expFee = ej.fee; } } } catch (e) {}
        const calc = computeOrder(items, expFee);
        await lineFlex(TOKEN, replyToken, "ยืนยันรายการสั่งซื้อ", orderConfirmFlex(calc), userId);
        // เก็บออเดอร์ด้วยยอดที่โค้ดคิด (ให้ SlipOK เทียบยอดถูก)
        try {
          if (env.CONV) {
            const itemBlock = calc.rows.map(r => "- " + r.label + " = " + r.line).join("\n");
            const block = "📦 ออเดอร์ (รอโอน)\n" + itemBlock + "\nยอดสินค้า " + calc.goods + "\n" + (calc.express ? "ค่าส่งด่วน " : "ค่าส่ง ") + calc.ship + "\nรวมยอดชำระ " + calc.total + "\nที่อยู่: (รอลูกค้าแจ้งหลังโอน)";
            const name = await lineProfileName(TOKEN, userId);
            await env.CONV.put("ord:" + shopId + ":" + userId, JSON.stringify({ name, block, t: Date.now(), status: "รอโอน 💰", uid: userId }), { expirationTtl: 259200 });
            orderStored = true;
          }
        } catch (e) {}
      } else {
        await lineReply(TOKEN, replyToken, reply, userId);
      }
    } else {
      await lineReply(TOKEN, replyToken, reply, userId);
    }

    // 📦 ถ้าจีทูสรุปออเดอร์ครบ (มีบล็อก "📦 สรุปออเดอร์" + ช่องสินค้ามีค่าจริง) → เก็บเข้าคิวออเดอร์
    // กันบล็อกเปล่า: บรรทัด "สินค้า:" ต้องตามด้วยตัวอักษรจริง (ไม่ใช่ว่าง/ขึ้นบรรทัดทันที)
    // ขั้น 1: ทวนคำสั่งซื้อ+แจ้งยอด (ยังไม่ชำระ) | ขั้น 3: สรุปออเดอร์หลังชำระ+ที่อยู่
    const isPayBlock = !orderStored && reply.indexOf("ทวนคำสั่งซื้อ") !== -1 && /รวมยอดชำระ\s*[\d,]+/.test(reply);
    const isOrderBlock = reply.indexOf("📦 สรุปออเดอร์") !== -1 && /สินค้า:[ \t]*[^\s<]/.test(reply);
    try {
      if (env.CONV && (isPayBlock || isOrderBlock)) {
        const ordKey = "ord:" + shopId + ":" + userId;
        const name = await lineProfileName(TOKEN, userId);
        // รักษาสถานะ "ชำระแล้ว ✅" ถ้าเคยตรวจสลิปผ่านแล้ว (บล็อกที่อยู่มาทีหลังไม่ควรรีเซ็ตกลับเป็นรอโอน)
        let status = isOrderBlock ? "ชำระแล้ว ✅ (พร้อมจัดส่ง)" : "รอโอน 💰";
        try { const prev = await env.CONV.get(ordKey); if (prev) { const pj = JSON.parse(prev); if (pj.status && pj.status.indexOf("✅") !== -1 && !isOrderBlock) status = pj.status; } } catch (e) {}
        await env.CONV.put(ordKey, JSON.stringify({ name, block: reply.slice(0, 1600), t: Date.now(), status, uid: userId }), { expirationTtl: 259200 }); // เก็บ 3 วัน
        // 💾 จำลูกค้า: ออเดอร์สำเร็จ (มีที่อยู่ครบ) → บันทึกชื่อ/เบอร์/ที่อยู่ไว้ถาวร ครั้งหน้าถาม "ส่งที่เดิมไหม"
        if (isOrderBlock) {
          const gn = (re) => { const m = reply.match(re); return m ? m[1].trim().slice(0, 200) : ""; };
          const cName = gn(/ชื่อผู้รับ:[ \t]*(.+)/), cTel = gn(/เบอร์:[ \t]*(.+)/), cAddr = gn(/ที่อยู่:[ \t]*(.+)/);
          if (cAddr && cAddr.indexOf("<") === -1) await env.CONV.put("cust:" + shopId + ":" + userId, JSON.stringify({ name: cName, tel: cTel, addr: cAddr, t: Date.now() }));
        }
      }
    } catch (e) {}

    // ถ้า AI ส่งต่อเคสให้แอดมินหลังการขาย → เงียบแชทนี้ให้แอดมินดูแล (best-effort)
    try { if (reply.indexOf("แอดมินหลังการขาย") !== -1) await muteNow("เคสปัญหา/หลังการขาย ⚠️", (userForHistory && userForHistory.content) || ""); } catch (e) {}

    // บันทึกประวัติ (best-effort — ถ้าโควต้าเขียน KV เต็ม ก็ข้ามไป ไม่กระทบการตอบ)
    try {
      if (env.CONV) {
        const next = [...history, userForHistory, { role: "assistant", content: reply }].slice(-20);
        await env.CONV.put(key, JSON.stringify(next), { expirationTtl: 3600 });
      }
    } catch (e) { console.log("HIST_SKIP " + String(e).slice(0, 80)); }
    // 👥 จดรายชื่อแชทที่คุยอยู่ (ให้แอดมินเลือกปิดจีทูรายคนได้ในหลังบ้าน) — เก็บ 2 วัน
    try {
      if (env.CONV) {
        let nm = "";
        try { const old = await env.CONV.get("chat:" + shopId + ":" + userId); if (old) nm = (JSON.parse(old).name || ""); } catch (x) {}
        if (!nm) { try { nm = await lineProfileName(TOKEN, userId); } catch (x) {} }
        await env.CONV.put("chat:" + shopId + ":" + userId, JSON.stringify({ name: nm, t: Date.now(), uid: userId }), { expirationTtl: 172800 });
      }
    } catch (e) {}
  } catch (e) {
    console.log("HANDLE_ERR " + String(e).slice(0, 150));
  }
}

async function askAI(apiKey, messages, models) {
  const list = models || MODELS;
  let idx = 0;
  for (const model of list) {
    // ตัวแรกให้เวลาคิดนาน (prompt ความรู้สินค้ายาว ใช้เวลา) ตัวสำรองให้สั้นลง กัน reply token หมดอายุ
    const limitMs = idx === 0 ? 25000 : 12000;
    idx++;
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 500 }),
        signal: AbortSignal.timeout(limitMs), // ตัวแรก 25 วิ / ตัวสำรอง 12 วิ (ถ้า reply token หมดอายุ ระบบส่งแบบ push แทนอยู่แล้ว)
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
  // ทุกโมเดลตอบไม่ได้ (มักเกิดตอนโมเดลปฏิเสธคำถามบางประเภท) → ตอบสุภาพ ไม่บอกลูกค้าว่าระบบพัง
  return "รอสักครู่นะคะ 🙏🏻 แอดมินหลังการขายจะเข้ามาดูแลให้บริการค่ะ 💕";
}

// ⏰ ตามลูกค้าค้างจ่าย: วนออเดอร์ "รอโอน" ที่เกินเวลา → ส่งข้อความเตือน (push)
// เตือนครั้งที่ 1 หลัง 1 ชม. | ครั้งที่ 2 หลัง 6 ชม. | ชำระแล้ว/แอดมินดูแล = ข้าม
// 🔄 ซิงก์สต็อกจากไฟล์ฐาน (export จาก XSelly) ที่เก็บไว้บน GitHub
// ใช้เป็น "ตัวตั้งต้นความจริง" สำหรับกลิ่นที่ webhook ไม่เคยยิงมา (ของหมดตั้งแต่ก่อนเชื่อมระบบ/ตัดสต็อกด้วยมือ)
// ⛔ ไม่ทับตัวเลขที่ webhook เพิ่งอัปเดต — ของสดกว่าเสมอ
const STOCK_BASE_URL = "https://raw.githubusercontent.com/milinmengg-oss/hr-app/main/abc-stock-baseline.json";
const SKUMAP_URL = "https://raw.githubusercontent.com/milinmengg-oss/hr-app/main/abc-skumap.json";
async function syncStockBaseline(env, force) {
  if (!env.CONV) return { skip: "no KV" };
  const now = Date.now(), DAY = 86400000;
  if (!force) {
    const last = parseInt((await env.CONV.get("basesync_t")) || "0", 10);
    if (now - last < DAY) return { skip: "ซิงก์ไปแล้วภายใน 24 ชม." }; // วันละครั้งพอ
  }
  const r = await fetch(STOCK_BASE_URL, { cf: { cacheTtl: 60 } });
  if (!r.ok) return { error: "โหลดไฟล์ฐานไม่ได้ " + r.status };
  const base = await r.json();
  const stock = JSON.parse((await env.CONV.get("stockmap")) || "{}");
  const ts = JSON.parse((await env.CONV.get("stockts")) || "{}");
  let updated = 0, kept = 0, added = 0;
  for (const nm in base) {
    if (ts[nm]) { kept++; continue; }              // webhook เคยอัปเดตแล้ว = สดกว่า ไม่แตะ
    if (!(nm in stock)) added++;
    else if (stock[nm] !== base[nm]) updated++;
    stock[nm] = base[nm];
  }
  await env.CONV.put("stockmap", JSON.stringify(stock));
  await env.CONV.put("basesync_t", String(now));
  // อัปเดตตาราง SKU→ชื่อ ด้วย (ให้ webhook ของสินค้าใหม่แมพชื่อถูก)
  try {
    const s = await fetch(SKUMAP_URL, { cf: { cacheTtl: 60 } });
    if (s.ok) await env.CONV.put("skumap", await s.text());
  } catch (e) {}
  console.log("BASESYNC updated=" + updated + " added=" + added + " kept=" + kept);
  return { อัปเดตให้ตรงไฟล์: updated, เพิ่มใหม่: added, คงค่าจาก_webhook: kept, รวมทั้งหมด: Object.keys(stock).length };
}

async function followUpUnpaid(env) {
  if (!env.CONV) return 0;
  const now = Date.now(), H = 3600000;
  let reminded = 0;
  try {
    const list = await env.CONV.list({ prefix: "ord:" });
    for (const k of list.keys) {
      try {
        const raw = await env.CONV.get(k.name);
        if (!raw) continue;
        const o = JSON.parse(raw);
        if (!o.uid || o.uid === "anon") continue;
        if (o.status && o.status.indexOf("✅") !== -1) continue;      // ชำระแล้ว → ไม่เตือน
        const parts = k.name.split(":"); const shop = parts[1];
        if (await env.CONV.get("mute:" + shop + ":" + o.uid)) continue; // แอดมินกำลังดูแล → ไม่เตือน
        const age = now - (o.t || 0), remind = o.remind || 0;
        let msg = "";
        // เตือนครั้งเดียวพอ (หลัง 1 ชม.) — เตือนซ้ำลูกค้ารำคาญ/บล็อกได้
        if (remind === 0 && age >= 1 * H)
          msg = "สวัสดีค่ะคุณลูกค้า 💕 ร้าน ABC เห็นว่าออเดอร์ของคุณลูกค้ายังไม่ได้ชำระเงินนะคะ 🥰\nสนใจรับสินค้าอยู่ไหมคะ? โอนแล้วส่งสลิปกลับมาในแชทนี้ได้เลยค่ะ เดี๋ยวจัดส่งให้ทันทีนะคะ 📦✨";
        if (!msg) continue;
        const token = env["LINE_TOKEN_" + (shop || "").toUpperCase()];
        if (!token) continue;
        const r = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ to: o.uid, messages: [{ type: "text", text: msg }] }),
        });
        if (r.ok) { o.remind = remind + 1; o.lastRemind = now; await env.CONV.put(k.name, JSON.stringify(o), { expirationTtl: 259200 }); reminded++; }
        else console.log("FOLLOWUP_PUSH_FAIL " + r.status);
      } catch (e) {}
    }
  } catch (e) { console.log("FOLLOWUP_ERR " + String(e).slice(0, 150)); }
  return reminded;
}

// ตรวจสลิปโอนเงินกับ SlipOK — ส่งรูปสลิปไปเช็ค (ยอด/บัญชีปลายทาง/ปลอม/ซ้ำ)
async function checkSlip(env, token, messageId) {
  try {
    if (!env.SLIPOK_KEY || !env.SLIPOK_BRANCH) return null;
    const r = await fetch("https://api-data.line.me/v2/bot/message/" + messageId + "/content", { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const ct = r.headers.get("content-type") || "image/jpeg";
    const ext = ct.indexOf("png") !== -1 ? "png" : "jpg";
    const fd = new FormData();
    fd.append("files", new Blob([buf], { type: ct }), "slip." + ext);
    fd.append("log", "true"); // เก็บไว้ตรวจสลิปซ้ำ + เช็คบัญชีที่ผูกไว้
    const sr = await fetch("https://api.slipok.com/api/line/apikey/" + env.SLIPOK_BRANCH, {
      method: "POST",
      headers: { "x-authorization": env.SLIPOK_KEY },
      body: fd,
      signal: AbortSignal.timeout(12000),
    });
    let j = {}; try { j = await sr.json(); } catch (e) {}
    return { httpOk: sr.ok, status: sr.status, ...j };
  } catch (e) { console.log("SLIPOK_ERR " + String(e).slice(0, 160)); return null; }
}

// ดึงชื่อลูกค้าจาก LINE (ใช้ทั้งคิวแชท + คิวออเดอร์)
async function lineProfileName(token, userId) {
  if (!userId || userId === "anon") return "";
  try {
    const pr = await fetch("https://api.line.me/v2/bot/profile/" + userId, { headers: { Authorization: "Bearer " + token } });
    if (pr.ok) return ((await pr.json()).displayName || "").slice(0, 40);
  } catch (e) {}
  return "";
}

// โชว์จุดกำลังพิมพ์ 3 สี (LINE loading animation) — ต้องมี userId จริง (ใช้ได้กับแชท 1:1)
async function lineLoading(token, userId) {
  if (!userId || userId === "anon") return;
  try {
    await fetch("https://api.line.me/v2/bot/chat/loading/start", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: userId, loadingSeconds: 20 }),
    });
  } catch (e) {}
}

async function lineReply(token, replyToken, text, userId) {
  // ล้าง markdown ที่ LINE แสดงดิบ (**, ##) + จำกัด ~5000 ตัวอักษร/ข้อความ
  const msg = text.replace(/\*\*/g, "").replace(/(^|\n)#{1,6}\s+/g, "$1").slice(0, 4900);
  const r = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: msg }] }),
  });
  if (!r.ok) {
    console.log("LINE_REPLY_FAIL status=" + r.status + " " + (await r.text()).slice(0, 200));
    // แผนสอง: reply token หมดอายุ/ใช้ไปแล้ว → ส่งแบบ push แทน (ไม่ต้องใช้ token)
    if (userId && userId !== "anon") {
      const p = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: userId, messages: [{ type: "text", text: msg }] }),
      });
      if (!p.ok) console.log("LINE_PUSH_FAIL status=" + p.status);
    }
  }
}

// ── Flex Message: การ์ดต้อนรับ + ปุ่มดำโค้ง (กดแล้วส่งข้อความให้จีทูตอบต่อ) ──
function btnDark(label, text) {
  return {
    type: "box", layout: "vertical", backgroundColor: "#111418", cornerRadius: "20px",
    paddingTop: "10px", paddingBottom: "10px", paddingStart: "8px", paddingEnd: "8px",
    action: { type: "message", label: label.slice(0, 20), text: text },
    contents: [{ type: "text", text: label, color: "#FFFFFF", align: "center", weight: "bold", size: "xs", wrap: false, adjustMode: "shrink-to-fit" }]
  };
}
function welcomeFlex() {
  return {
    type: "bubble",
    body: {
      type: "box", layout: "vertical", paddingAll: "20px", backgroundColor: "#FFFFFF",
      contents: [
        { type: "text", text: "ABC ยินดีต้อนรับค่ะ ✨", weight: "bold", size: "xl", color: "#111418", align: "center" },
        { type: "text", text: "แอดมินยินดีให้บริการค่ะ 💚\nเลือกเมนูด้านล่างได้เลยนะคะ", size: "sm", color: "#666666", align: "center", wrap: true, margin: "md" },
        { type: "box", layout: "horizontal", margin: "lg", spacing: "sm", contents: [
          btnDark("🛒 เมนูสินค้า", "ดูเมนูสินค้า"),
          btnDark("🚚 การจัดส่ง", "รูปแบบการจัดส่ง")
        ] }
      ]
    }
  };
}
// แยกข้อมูลออเดอร์จากข้อความ "ทวนคำสั่งซื้อ" ที่ AI สร้าง → เอาไปทำการ์ด
function parseOrder(reply) {
  const num = (re) => { const m = reply.match(re); return m ? m[1].replace(/,/g, "") : ""; };
  const goods = num(/ยอดสินค้า\s*([\d,]+)/);
  const ship = num(/ค่าส่ง\s*([\d,]+)/);
  const total = num(/รวมยอดชำระ\s*([\d,]+)/);
  // บรรทัดรายการสินค้า = ระหว่างหัวข้อ "ทวนคำสั่งซื้อ" กับ "ยอดสินค้า"
  const lines = reply.split("\n").map(s => s.trim()).filter(Boolean);
  let items = [], started = false;
  for (const ln of lines) {
    if (ln.indexOf("ทวนคำสั่งซื้อ") !== -1) { started = true; continue; }
    if (/^ยอดสินค้า/.test(ln)) break;
    if (started) { const t = ln.replace(/^[-•●]\s*/, "").trim(); if (t && !/ตรวจสอบ|ถูกต้อง|ผิดพลาด/.test(t)) items.push(t); }
  }
  return { items, goods, ship, total };
}
// การ์ด 1: ยืนยันรายการสั่งซื้อ (โทนเขียว ABC) + ปุ่ม "ยืนยันรายการ" — รับผลจาก computeOrder
function orderConfirmFlex(o) {
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const itemRows = (o.rows && o.rows.length ? o.rows : [{ label: "(รายการสินค้า)", line: 0 }]).map(r => ({
    type: "box", layout: "horizontal", margin: "sm", contents: [
      { type: "text", text: r.label, size: "sm", color: "#333333", wrap: true, flex: 5 },
      { type: "text", text: (r.line ? fmt(r.line) + " บาท" : "-"), size: "sm", color: "#333333", align: "end", flex: 3 }
    ]
  }));
  const sumRow = (label, val) => ({ type: "box", layout: "horizontal", margin: "sm", contents: [
    { type: "text", text: label, size: "sm", color: "#888888" },
    { type: "text", text: val, size: "sm", color: "#555555", align: "end" }
  ] });
  const body = [
    { type: "text", text: "กรุณาตรวจสอบความถูกต้อง", size: "xs", color: "#999999" },
    { type: "box", layout: "vertical", margin: "md", contents: itemRows },
    { type: "separator", margin: "lg" }
  ];
  body.push(sumRow("ยอดสินค้า", fmt(o.goods) + " บาท"));
  body.push(sumRow(o.express ? "ค่าส่งด่วน 🛵" : "ค่าส่ง", (o.ship ? fmt(o.ship) : "0") + " บาท" + (o.freeShip ? " (ฟรี)" : "")));
  body.push({ type: "box", layout: "horizontal", margin: "md", contents: [
    { type: "text", text: "รวม", weight: "bold", size: "md", color: "#333333", gravity: "center" },
    { type: "text", text: fmt(o.total) + " บาท", weight: "bold", size: "xl", color: "#111418", align: "end" }
  ] });
  return {
    type: "bubble",
    header: { type: "box", layout: "vertical", backgroundColor: "#111418", paddingAll: "16px",
      contents: [{ type: "text", text: "👑 ยืนยันรายการสั่งซื้อ", color: "#FFFFFF", weight: "bold", size: "lg" }] },
    body: { type: "box", layout: "vertical", paddingAll: "18px", contents: body },
    footer: { type: "box", layout: "vertical", paddingAll: "14px", spacing: "sm", contents: [
      { type: "text", text: "👇 กดปุ่มด้านล่างเพื่อยืนยันรายการ", size: "xs", color: "#888888", align: "center" },
      { type: "box", layout: "vertical", backgroundColor: "#111418", cornerRadius: "10px", paddingAll: "13px",
        action: { type: "message", label: "ยืนยันรายการ", text: "ยืนยัน" },
        contents: [{ type: "text", text: "✅ ยืนยันรายการ", color: "#FFFFFF", weight: "bold", align: "center", size: "md" }] },
      { type: "text", text: "หรือพิมพ์ 'ยืนยัน' ได้เลยค่ะ 🙏🏻", size: "xxs", color: "#aaaaaa", align: "center" }
    ] }
  };
}
// การ์ด 2: สรุปยอด + แจ้งบัญชี (โทนเขียว) + ปุ่มคัดลอกเลขบัญชี (clipboard จริง)
function payFlex(total, bankLines, acctNo) {
  const bankRows = bankLines.map((t, i) => ({ type: "text", text: t, size: i === 1 ? "xxl" : "sm", weight: i === 1 ? "bold" : "regular", color: i === 1 ? "#111418" : "#333333", wrap: true, margin: i === 0 ? "none" : "sm" }));
  return {
    type: "bubble",
    header: { type: "box", layout: "vertical", backgroundColor: "#111418", paddingAll: "16px",
      contents: [{ type: "text", text: "👑 สรุปรายการสั่งซื้อ", color: "#FFFFFF", weight: "bold", size: "lg" }] },
    body: { type: "box", layout: "vertical", paddingAll: "18px", contents: [
      { type: "box", layout: "horizontal", contents: [
        { type: "text", text: "รวมยอดโอน", weight: "bold", size: "md", color: "#333333", gravity: "center" },
        { type: "text", text: total + " บาท ✅", weight: "bold", size: "lg", color: "#111418", align: "end", gravity: "center" }
      ] },
      { type: "separator", margin: "lg" },
      { type: "text", text: "โอนเข้าบัญชี", size: "xs", color: "#999999", margin: "lg" },
      { type: "box", layout: "vertical", margin: "sm", contents: bankRows },
      { type: "box", layout: "vertical", backgroundColor: "#FFF7E6", cornerRadius: "8px", paddingAll: "12px", margin: "lg", contents: [
        { type: "text", text: "📸 เมื่อโอนเงินเสร็จแล้ว รบกวนส่งเป็นรูปสลิปจากแอปธนาคารเท่านั้น", size: "xs", color: "#9a6a00", wrap: true },
        { type: "text", text: "❌ ไม่รับรูปถ่ายจากกล้องมือถือ", size: "xs", color: "#c0392b", wrap: true, margin: "sm" }
      ] }
    ] },
    footer: { type: "box", layout: "vertical", paddingAll: "14px", contents: [
      { type: "box", layout: "vertical", backgroundColor: "#111418", cornerRadius: "10px", paddingAll: "13px",
        action: { type: "clipboard", label: "คัดลอกเลขบัญชี", clipboardText: acctNo },
        contents: [{ type: "text", text: "📋 คัดลอกเลขบัญชี", color: "#FFFFFF", weight: "bold", align: "center", size: "md" }] },
      { type: "text", text: "โอนแล้วรบกวนส่งสลิปมาเลยนะคะ 🙏🏻", size: "xxs", color: "#aaaaaa", align: "center", margin: "sm" }
    ] }
  };
}
async function lineFlex(token, replyToken, altText, contents, userId) {
  const msg = { type: "flex", altText: altText.slice(0, 400), contents };
  const r = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [msg] }),
  });
  if (!r.ok) {
    console.log("LINE_FLEX_FAIL status=" + r.status + " " + (await r.text()).slice(0, 200));
    if (userId && userId !== "anon") {
      await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: userId, messages: [msg] }),
      });
    }
  }
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
