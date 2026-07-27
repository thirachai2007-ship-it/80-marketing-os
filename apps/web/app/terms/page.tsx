import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ข้อกำหนดการใช้บริการ | 80 Marketing OS",
  description: "ข้อกำหนดการใช้บริการ 80 Marketing OS",
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
  nav: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap" as const,
    marginTop: "32px",
    paddingTop: "24px",
    borderTop: "1px solid #e4e6eb",
  },
};

export default function TermsPage() {
  return (
    <main style={styles.page}>
      <article style={styles.card}>
        <h1 style={styles.heading}>ข้อกำหนดการใช้บริการ</h1>
        <p style={styles.muted}>Terms of Service — 80 Marketing OS</p>
        <p style={styles.muted}>ปรับปรุงล่าสุด: 27 กรกฎาคม 2026</p>

        <p>
          ข้อกำหนดนี้ใช้กับการใช้งาน 80 Marketing OS
          ซึ่งเป็นระบบสนับสนุนการวางแผน วิเคราะห์ จัดเตรียม
          และจัดการงานการตลาดของ 80t-shirt
          การใช้งานระบบถือว่าผู้ใช้ยอมรับข้อกำหนดนี้
        </p>

        <h2 style={styles.subheading}>1. ผู้มีสิทธิ์ใช้งาน</h2>
        <p>
          ผู้ใช้ต้องมีสิทธิ์ตามกฎหมายและสิทธิ์ที่ถูกต้องในการเข้าถึงเพจ,
          บัญชีโฆษณา, Business Portfolio และทรัพย์สินอื่นที่เชื่อมต่อกับระบบ
          ห้ามใช้ระบบกับบัญชีหรือทรัพย์สินที่ไม่ได้รับอนุญาต
        </p>

        <h2 style={styles.subheading}>2. ขอบเขตบริการ</h2>
        <p>
          ระบบอาจช่วยวิเคราะห์ข้อมูล สร้างแผน ร่างแคมเปญ ร่างโฆษณา
          และเรียกใช้ Meta Marketing API ตามสิทธิ์ที่ผู้ใช้อนุญาต
          ฟังก์ชันบางส่วนอาจขึ้นอยู่กับสถานะ Access Token,
          สิทธิ์ของ Meta, กฎของบัญชีโฆษณา และความพร้อมของบริการภายนอก
        </p>

        <h2 style={styles.subheading}>3. การอนุมัติและค่าใช้จ่ายโฆษณา</h2>
        <p>
          การเผยแพร่ เปิดใช้งาน เพิ่มงบประมาณ หรือดำเนินการที่อาจก่อให้เกิดค่าใช้จ่าย
          ต้องได้รับการอนุมัติจากเจ้าของตามกระบวนการของระบบ
          ผู้ใช้ยังคงมีหน้าที่ตรวจสอบชื่อแคมเปญ กลุ่มเป้าหมาย งบประมาณ
          ครีเอทีฟ ลิงก์ปลายทาง และสถานะของโฆษณาก่อนเปิดใช้งานจริง
        </p>

        <h2 style={styles.subheading}>4. การใช้งานที่ห้าม</h2>
        <p>
          ห้ามใช้ระบบเพื่อหลีกเลี่ยงนโยบายของ Meta, เข้าถึงข้อมูลโดยไม่ได้รับอนุญาต,
          ส่งข้อมูลเท็จ, สร้างโฆษณาที่ผิดกฎหมาย,
          รบกวนความปลอดภัยของระบบ หรือเปิดเผย Token และข้อมูลรับรองแก่บุคคลที่ไม่เกี่ยวข้อง
        </p>

        <h2 style={styles.subheading}>5. เนื้อหาและทรัพย์สินทางปัญญา</h2>
        <p>
          ผู้ใช้งานต้องมีสิทธิ์ใช้โลโก้ รูปภาพ วิดีโอ ข้อความ รายชื่อลูกค้า
          และเนื้อหาที่ส่งเข้าสู่ระบบ
          ผู้ใช้รับผิดชอบต่อความถูกต้องและความชอบด้วยกฎหมายของเนื้อหาดังกล่าว
        </p>

        <h2 style={styles.subheading}>6. บริการของบุคคลภายนอก</h2>
        <p>
          ระบบเชื่อมต่อกับบริการภายนอก เช่น Meta
          การใช้งานบริการเหล่านั้นอยู่ภายใต้ข้อกำหนดและนโยบายของผู้ให้บริการแต่ละราย
          เราไม่รับประกันว่าบริการภายนอกจะพร้อมใช้งานตลอดเวลา
          หรือจะอนุมัติโฆษณาทุกชิ้น
        </p>

        <h2 style={styles.subheading}>7. การรับประกันและข้อจำกัดความรับผิด</h2>
        <p>
          ระบบให้บริการตามสภาพที่เป็นอยู่
          ผลการวิเคราะห์และคำแนะนำเป็นเครื่องมือสนับสนุนการตัดสินใจ
          ไม่ใช่การรับประกันยอดขาย ผลลัพธ์โฆษณา หรือการอนุมัติจาก Meta
          ผู้ใช้ควรตรวจสอบข้อมูลสำคัญก่อนดำเนินการจริงเสมอ
        </p>

        <h2 style={styles.subheading}>8. การระงับหรือยุติการใช้งาน</h2>
        <p>
          เราอาจจำกัดหรือระงับการใช้งานเมื่อพบความเสี่ยงด้านความปลอดภัย,
          การใช้ผิดวัตถุประสงค์, การละเมิดนโยบาย หรือเมื่อจำเป็นต่อการปกป้องระบบและผู้ใช้
        </p>

        <h2 style={styles.subheading}>9. การเปลี่ยนแปลงข้อกำหนด</h2>
        <p>
          เราอาจแก้ไขข้อกำหนดนี้เมื่อระบบหรือกฎหมายเปลี่ยนแปลง
          โดยจะแสดงวันที่ปรับปรุงล่าสุดไว้ด้านบน
        </p>

        <h2 style={styles.subheading}>10. ติดต่อเรา</h2>
        <p>
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
