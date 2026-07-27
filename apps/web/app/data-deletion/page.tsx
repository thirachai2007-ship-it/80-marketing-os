import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "คำแนะนำการลบข้อมูล | 80 Marketing OS",
  description:
    "คำแนะนำสำหรับขอลบข้อมูลผู้ใช้จาก 80 Marketing OS",
};

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f7f9",
    color: "#1c1e21",
    fontFamily:
      'Arial, "Noto Sans Thai", "Tahoma", sans-serif',
    padding: "40px 20px",
  },
  card: {
    maxWidth: "920px",
    margin: "0 auto",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "40px",
    boxShadow: "0 8px 28px rgba(0,0,0,0.08)",
    lineHeight: 1.75,
  },
  heading: { fontSize: "34px", margin: "0 0 8px" },
  subheading: { fontSize: "22px", marginTop: "30px", marginBottom: "8px" },
  muted: { color: "#606770" },
  link: { color: "#0866ff" },
  code: {
    background: "#f0f2f5",
    borderRadius: "8px",
    padding: "2px 8px",
  },
  nav: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap" as const,
    marginTop: "32px",
    paddingTop: "24px",
    borderTop: "1px solid #e4e6eb",
  },
};

export default function DataDeletionPage() {
  return (
    <main style={styles.page}>
      <article style={styles.card}>
        <h1 style={styles.heading}>คำแนะนำการลบข้อมูลผู้ใช้</h1>
        <p style={styles.muted}>User Data Deletion Instructions — 80 Marketing OS</p>
        <p style={styles.muted}>ปรับปรุงล่าสุด: 27 กรกฎาคม 2026</p>

        <p>
          ผู้ใช้สามารถขอลบข้อมูลที่ 80 Marketing OS
          ประมวลผลจากการเชื่อมต่อกับ Meta ได้ตามขั้นตอนด้านล่าง
        </p>

        <h2 style={styles.subheading}>วิธีที่ 1: ส่งคำขอทางอีเมล</h2>
        <ol>
          <li>
            ส่งอีเมลไปที่{" "}
            <a style={styles.link} href="mailto:thirachai2007@gmail.com">
              thirachai2007@gmail.com
            </a>
          </li>
          <li>
            ใช้หัวข้ออีเมล{" "}
            <span style={styles.code}>Data Deletion Request — 80 Marketing OS</span>
          </li>
          <li>
            ระบุชื่อบัญชี Meta, อีเมลที่เกี่ยวข้อง และรหัสเพจหรือบัญชีธุรกิจ
            เท่าที่จำเป็นสำหรับการยืนยันคำขอ
          </li>
          <li>
            ระบุว่าต้องการลบข้อมูลทั้งหมด
            หรือระบุประเภทข้อมูลที่ต้องการลบ
          </li>
        </ol>

        <h2 style={styles.subheading}>วิธีที่ 2: เพิกถอนสิทธิ์ของแอปจาก Meta</h2>
        <p>
          ผู้ใช้สามารถเข้าไปที่การตั้งค่าบัญชี Meta
          และลบการเชื่อมต่อของแอป 80 Marketing OS
          จากส่วนแอปและเว็บไซต์หรือการเชื่อมต่อทางธุรกิจ
          การดำเนินการนี้จะหยุดการเข้าถึงข้อมูลใหม่จาก Meta
          แต่หากต้องการลบข้อมูลที่ระบบเคยจัดเก็บไว้แล้ว
          กรุณาส่งคำขอทางอีเมลตามวิธีที่ 1
        </p>

        <h2 style={styles.subheading}>ข้อมูลที่อาจถูกลบ</h2>
        <p>
          ข้อมูลที่ลบอาจรวมถึงข้อมูลระบุตัวบัญชีที่เชื่อมต่อ,
          ข้อมูลเพจและบัญชีโฆษณาที่ผูกกับผู้ใช้,
          Token หรือข้อมูลรับรองที่ระบบจัดเก็บ,
          ข้อมูลแคมเปญและบันทึกการใช้งานที่เชื่อมโยงกับผู้ขอ
          ทั้งนี้ เราอาจเก็บข้อมูลบางส่วนเท่าที่กฎหมายกำหนด
          หรือเท่าที่จำเป็นสำหรับการรักษาความปลอดภัยและการตรวจสอบเหตุการณ์
        </p>

        <h2 style={styles.subheading}>ระยะเวลาดำเนินการ</h2>
        <p>
          เราจะยืนยันการรับคำขอและดำเนินการภายในระยะเวลาที่เหมาะสม
          โดยทั่วไปไม่เกิน 30 วันหลังจากยืนยันตัวตนและรายละเอียดคำขอครบถ้วน
          หากคำขอซับซ้อนหรือมีกฎหมายกำหนดแตกต่างออกไป
          เราจะแจ้งสถานะให้ผู้ขอทราบ
        </p>

        <h2 style={styles.subheading}>การยืนยันคำขอ</h2>
        <p>
          เพื่อป้องกันการลบข้อมูลโดยผู้ไม่มีสิทธิ์
          เราอาจขอข้อมูลเพิ่มเติมเพื่อยืนยันว่าผู้ขอมีสิทธิ์ในบัญชี,
          เพจ หรือทรัพย์สินทางธุรกิจที่เกี่ยวข้อง
          โปรดอย่าส่งรหัสผ่าน App Secret หรือ Access Token ทางอีเมล
        </p>

        <h2 style={styles.subheading}>ติดต่อเรา</h2>
        <p>
          80t-shirt / 80 Marketing OS
          <br />
          ประเทศ: Thailand
          <br />
          อีเมล:{" "}
          <a style={styles.link} href="mailto:thirachai2007@gmail.com">
            thirachai2007@gmail.com
          </a>
        </p>

        <nav style={styles.nav}>
          <a style={styles.link} href="/privacy">Privacy Policy</a>
          <a style={styles.link} href="/terms">Terms of Service</a>
          <a style={styles.link} href="/data-deletion">Data Deletion</a>
        </nav>
      </article>
    </main>
  );
}
