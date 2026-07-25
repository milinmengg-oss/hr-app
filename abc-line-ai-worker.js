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
const MODELS = [
  "deepseek/deepseek-chat",              // หลัก: เชื่อฟังกฎแม่น + ถูก
  "qwen/qwen-2.5-72b-instruct",
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
const PRICE_KEYS = Object.keys(PRICE).sort((a, b) => b.length - a.length); // ยาวก่อน กันจับคู่ผิด
function findPrice(modelText) {
  const t = (modelText || "").toUpperCase();
  for (const k of PRICE_KEYS) if (t.indexOf(k.toUpperCase()) !== -1) return { key: k, price: PRICE[k] };
  return null;
}
// หัวน้ำยาใหญ่ Big Pod (โปร 4 ชิ้นส่งฟรี) | หัวน้ำยาเล็ก (โปร 10 หัวส่งฟรี)
const BIGPOD = ["RELX BOOST POD", "RELX POD CLEAR 18K", "ELFBAR SWAP 25K", "ESKO BAR SWITCH 20K", "KS QUIK PRO 15K", "M SWITCH", "VAZER RELOAD 15K", "ABC TANK 22K", "ABC TANK", "ABC LEGO 20K", "ABC LEGO"];
const SMALLPOD = ["INFY PLUS", "MARBO ZERO", "RELX INFINITY", "RELX LARGE", "RELX ULTRA"];
function catOf(key) {
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
  const freeShip = disp >= 4 || small >= 10 || big >= 4 || cloneQty >= 20;
  const ship = freeShip ? 0 : 40;
  return { rows, goods, ship, total: goods + ship, freeShip, express: false };
}

// 🩹 แก้ SKU ใหม่ที่ยังไม่มีในตารางชื่อ (skumap) — ฝังในโค้ด ไม่ต้อง re-seed
// พอมีสินค้าใหม่แล้วจีทูเห็นเป็นรหัสดิบ ให้เพิ่มคู่ "รหัส SKU": "ชื่อรุ่น - กลิ่น" ที่นี่
const SKU_FIX = {
  "IN-DP-00-20-03-022": "INFY 20K - ชานมชาจี",
  "IN-DP-00-20-03-023": "INFY 20K - ชาเขียวมัทฉะ"
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
function extractLatLng(s) {
  if (!s) return null;
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
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) });
    ll = extractLatLng(r.url || "");
    if (ll) return ll;
    const body = await r.text();
    ll = extractLatLng(body);
    if (ll) return ll;
  } catch (e) { console.log("MAP_RESOLVE_ERR " + String(e).slice(0, 80)); }
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

# ค่าส่ง + โปรโมชั่น (กฎเหล็ก — ยึดตามนี้เท่านั้น ห้ามแต่งเพิ่มเอง)
## ค่าส่ง
- ขนส่งเอกชน (พัสดุปกติ) = 40 บาท ทั่วประเทศ / ฟรี ถ้าเข้าเงื่อนไข "โปรหลัก" หรือ "เรทขายส่ง" ด้านล่าง
- ส่งด่วน (เฉพาะ กทม.+ปริมณฑล) = คิดตามระยะทาง ให้ขอลูกค้า "แชร์โลเคชั่น (ปักหมุด) หรือส่งลิงก์ Google Maps" มา แล้วระบบจะคำนวณค่าส่งด่วนให้อัตโนมัติ (⛔ จีทูอย่ากุตัวเลขเอง ถ้ายังไม่มีหมุด/ลิงก์ — พอลูกค้าส่งหมุดหรือลิงก์แผนที่มา ระบบจะตอบค่าส่งให้เอง)
- ⛔ นอกจาก 40 (ขนส่งเอกชน) กับ 0 (ฟรีตามโปร) ห้ามจีทูพูดตัวเลขค่าส่งอื่นเด็ดขาด
- ⛔⛔ ห้ามบอกชื่อบริษัทขนส่งที่ร้านใช้เด็ดขาด (ห้ามพูด Flash, Kerry, J&T, ไปรษณีย์, Grab, Lalamove ฯลฯ) — ถ้าลูกค้าถามว่าส่งขนส่งอะไร ให้ตอบแค่ "ใช้ขนส่งเอกชนค่ะ 🙏🏻" (ส่งด่วนเรียกว่า 'รอบส่งด่วน' เฉยๆ ห้ามระบุยี่ห้อ)

## 🎁 โปรหลัก (เข้าเงื่อนไข = ส่งฟรีพัสดุ | คละยี่ห้อได้ | ซื้อหลายโปรรวมกันได้)
- หัวน้ำยาเล็ก (หัวพอตราคา 120-140: INFY PLUS, MARBO ZERO, RELX INFINITY, RELX LARGE, RELX ULTRA) ครบ 10 หัว → ส่งฟรี
- พอตใช้แล้วทิ้ง ครบ 4 แท่ง → ส่งฟรี
- หัวน้ำยาใหญ่ Big Pod (RELX BOOST POD, RELX POD CLEAR 18K, ELFBAR SWAP, ESKO BAR SWITCH, KS QUIK PRO, M SWITCH, VAZER RELOAD, ABC TANK, ABC LEGO) และ/หรือ ชุด KIT รวมครบ 4 ชิ้น → ส่งฟรี
- Iqos (คอต/ไส้) ครบ 2 คอต → ส่งฟรี
⛔ RELX BOOST POD / ABC LEGO / หัวราคา 299-390 = "Big Pod" (โปร 4 ชิ้น) ไม่ใช่หัวน้ำยาเล็ก (10 หัว) — อย่าสับสน
เวลาลูกค้าซื้อใกล้ครบเงื่อนไข ให้เชียร์ให้ครบเพื่อรับส่งฟรี (เช่น ซื้อสูบทิ้ง 3 แท่ง → "รับเพิ่มอีก 1 แท่งครบ 4 แท่ง ส่งฟรีเลยนะคะ 💕")

## 🎁 โปรแถมสินค้า (ไม่ส่งฟรี — แต่แถมของฟรี | ซื้อร่วมโปรหลักได้)
- Big Pod (ABC LEGO / RELX BOOST POD / RELX POD CLEAR ฯลฯ) ครบ 5 หัว → แถมเครื่องเปล่า 1 (มูลค่า 250) → ⛔ ระบบเติมให้ในการ์ดเอง คุณไม่ต้องใส่บรรทัด แค่บอกลูกค้าว่า "เข้าโปรรับเครื่องเปล่าฟรีนะคะ 🎁"
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
ตัวอย่าง: ลูกค้าเอา มาโบ 9k องุ่น 2 โคล่า 2 + infy 20k มินต์ 3 → คุณพิมพ์:
ขออนุญาตทวนคำสั่งซื้ออีกครั้งนะคะ 🧾
- MARBO 9K | องุ่น | 2
- MARBO 9K | โคล่า | 2
- INFY 20K | มินต์ | 3
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
- ส่งด่วน: มีบริการในบางพื้นที่ (กทม.+ปริมณฑล) ตอบว่า "มีบริการส่งด่วนค่ะ 🛵 รบกวนคุณลูกค้าแชร์โลเคชั่น (ปักหมุด) มาให้หน่อยนะคะ เดี๋ยวแอดมินเช็คค่าส่งด่วนและแจ้งรอบส่งให้ค่ะ" — ⛔ ห้ามกุค่าส่งด่วนเอง (ค่าส่งด่วนขึ้นกับระยะทาง แอดมินเช็คเท่านั้น) พอลูกค้าส่งหมุดแล้ว ให้ตอบรับและส่งต่อแอดมิน ("รอสักครู่นะคะ แอดมินหลังการขายจะเข้ามาดูแลให้บริการค่ะ 🙏🏻")
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

# ตัวอย่างบทสนทนาปิดการขายครบวงจร (ลำดับสำคัญ — เลียนแบบเป๊ะ)
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
  // ⏰ Cron: ตามลูกค้าค้างจ่าย — เตือนออเดอร์ "รอโอน" ที่เกินเวลา (ต้องตั้ง Cron Trigger ใน Cloudflare)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(followUpUnpaid(env));
  },
  async fetch(request, env, ctx) {
    const url0 = new URL(request.url);
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
          return J({ on: !off, muted: list.keys.length });
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
            let e = {}; try { e = JSON.parse(v); } catch (x) {}
            items.push({ uid: e.uid || k.name.split(":").pop(), name: e.name || "", reason: e.reason || "เคสปัญหา", msg: e.msg || "", t: e.t || 0 });
          }
          items.sort((a, b) => b.t - a.t);
          return J({ queue: items });
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
        const total = {};
        for (const nm in nm2id) { const id = nm2id[nm]; total[id] = (total[id] || 0) + (sm[nm] > 0 ? sm[nm] : 0); }
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
        const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
        const out = {};
        for (const nm in NM2ID) {
          const parts = nm.split(" - ");
          if (parts.length < 2) continue;              // ไม่มีกลิ่น (อุปกรณ์เสริม) ข้าม
          const flav = parts.slice(1).join(" - ");
          const key = NM2ID[nm] + "|" + norm(flav);
          out[key] = (out[key] === true) || (sm[nm] > 0); // ถ้ามีตัวใดตัวหนึ่งเหลือ = กลิ่นนี้มีของ
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
            let n = 0;
            for (const it of items) {
              if (!it || !it.sku) continue; // sku อาจเป็นค่าว่างตาม doc
              const nm = SKU_FIX[it.sku] || skumap[it.sku] || it.sku;
              stock[nm] = +it.new; n++;
            }
            if (n) await env.CONV.put("stockmap", JSON.stringify(stock));
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
    const key = `conv2:${shopId}:${userId}`; // conv2 = ล้างความจำรุ่นเก่าที่มีตัวอย่างตอบมั่ว
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
    const sysFull = sysPrompt + outNote;

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
          { type: "text", text: "ลูกค้าส่งรูปนี้มา ขั้นแรก: จำแนกก่อนว่าเป็นรูปอะไร — ถ้าเป็น 'สลิปโอนเงิน/หลักฐานการชำระเงิน' (มีโลโก้ธนาคาร ยอดเงิน วันเวลา เลขอ้างอิง) ให้ตอบแค่คำเดียวว่า [SLIP] ห้ามพิมพ์อย่างอื่น\nถ้าเป็นรูปเมนู/สินค้า (มักวงกลมหรือทำเครื่องหมายสีแดงตรงตัวที่ต้องการ): บอกว่าลูกค้าเลือกสินค้ารุ่นอะไร ยืนยันชื่อรุ่น + ราคา (ยึดราคาจาก 'รายการสินค้า' ในระบบ) แล้วถามกลิ่น/สี และจำนวนต่อ ถ้ารูปไม่ชัดให้ขอให้ลูกค้าพิมพ์ชื่อรุ่นมายืนยันค่ะ" },
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

        const ADDR_FORM = "\n\nรบกวนขอที่อยู่จัดส่งให้ครบตามนี้นะคะ 📍\nชื่อผู้รับ :\nบ้านเลขที่ :\nซอย / หมู่ :\nตำบล / แขวง :\nอำเภอ / เขต :\nจังหวัด :\nเลขไปรษณีย์ :\nเบอร์โทรศัพท์ :\nเพื่อไม่ให้เกิดข้อผิดพลาดในการจัดส่งค่ะ 🙏🏻💕";

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
      reply = await askAI(env.OPENROUTER_KEY, [{ role: "system", content: sysFull + stockNote }, ...history.slice(-10), { role: "user", content: text }]);
      userForHistory = { role: "user", content: text };
    }

    // ⚡ ส่งคำตอบให้ลูกค้าก่อนเสมอ (ห้ามให้ขั้นตอนบันทึกประวัติมาบล็อกการตอบ)
    // 📦 ถ้าเป็นบล็อกทวนคำสั่งซื้อ → โค้ดคิดเงินเอง + ส่งการ์ด Flex "ยืนยันรายการ"
    let orderStored = false;
    if (reply.indexOf("ทวนคำสั่งซื้อ") !== -1) {
      const items = parseItems(reply);
      // 🛑 กันออกการ์ดก่อนรู้กลิ่น/จำนวนจริง — ถ้าช่องกลิ่นเป็น "คำถาม" (กลิ่นไหน/อะไร/เลือก) หรือจำนวนไม่ชัด → ยังไม่ออกการ์ด ให้ถามก่อน
      const notReady = !items.length || items.some(it => /ไหน|อะไร|\?|เลือก|กี่|ดีคะ|ระบุ|ทั้งหมด|โปรด/.test(it.flavor) || !(it.qty > 0));
      if (notReady) {
        await lineReply(TOKEN, replyToken, "รับกลิ่นไหน จำนวนกี่ชิ้นดีคะ 💕 (บอกรุ่น+กลิ่น+จำนวนมาได้เลยนะคะ)", userId);
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
  } catch (e) {
    console.log("HANDLE_ERR " + String(e).slice(0, 150));
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
        body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 500 }),
        signal: AbortSignal.timeout(15000), // โมเดลไหนช้าเกิน 15 วิ ตัดทิ้ง ลองตัวถัดไป (กัน reply token หมดอายุ)
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

// ⏰ ตามลูกค้าค้างจ่าย: วนออเดอร์ "รอโอน" ที่เกินเวลา → ส่งข้อความเตือน (push)
// เตือนครั้งที่ 1 หลัง 1 ชม. | ครั้งที่ 2 หลัง 6 ชม. | ชำระแล้ว/แอดมินดูแล = ข้าม
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
        if (remind === 0 && age >= 1 * H)
          msg = "สวัสดีค่ะคุณลูกค้า 💕 ร้าน ABC เห็นว่าออเดอร์ของคุณลูกค้ายังไม่ได้ชำระเงินนะคะ 🥰\nสนใจรับสินค้าอยู่ไหมคะ? โอนแล้วส่งสลิปกลับมาในแชทนี้ได้เลยค่ะ เดี๋ยวจัดส่งให้ทันทีนะคะ 📦✨";
        else if (remind === 1 && age >= 6 * H)
          msg = "รบกวนแจ้งเตือนอีกครั้งนะคะ 🙏🏻 ออเดอร์ของคุณลูกค้ายังรอการชำระเงินอยู่ค่ะ\nถ้ายังสนใจรับสินค้า รบกวนโอน + ส่งสลิปภายในวันนี้นะคะ 💕 (ถ้าไม่สะดวกแล้วแจ้งแอดมินได้เลยค่ะ)";
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
