# การดูแล GitHub Profile Stats

โปรไฟล์ใช้ GitHub Stats Extended สำหรับ Stats + Rank และ Demolab สำหรับ Streak ส่วน Most Used Languages อ่าน `./assets/stats/languages.svg` จากรีโป การ์ดทั้งสามคงธีมและเลย์เอาต์เดิม สถิติจากบริการภายนอกอาจล่าช้าตาม cache และอาจครอบคลุมกิจกรรม private ไม่ครบ

## Languages Automation

[Update profile statistics](https://github.com/souruuu/souruuu/actions/workflows/update-stats.yml) รันจาก `main` ที่ `17 23 * * *` หรือ **06:17 น. เวลาไทย** เมื่อ repository variable `STATS_PUBLISH_LANGUAGES=true` GitHub อาจเริ่มหลังเวลา cron และ run ที่ใช้ concurrency group เดียวกันจะไม่เขียนพร้อมกัน [GitHub schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

- **Generate** checkout ที่ event SHA ด้วย `contents: read` ติดตั้งจาก lockfile และรัน tests ก่อนอ่าน secrets จาก environment `profile-stats-read` ที่อนุญาตเฉพาะ `main` ตรวจ repository coverage, identity และความถูกต้องของ SVG
- **Publish** ใช้ `GITHUB_TOKEN` แบบ `contents: write` ตรวจ artifact ID จาก run เดียวกัน, digest, UTF-8 และโครงสร้าง SVG อีกครั้ง เขียนเฉพาะ `assets/stats/languages.svg` ผ่าน fast-forward bot commit เมื่อ bytes เปลี่ยน
- ผลรวมใช้ language bytes จาก GitHub Linguist ของ owned non-fork public repos และ private repos ที่อนุมัติ กรอง `prose` และ Rich Text Format ก่อนจัด Top 8 เปอร์เซ็นต์คำนวณจากผลรวม bytes ของภาษาที่แสดง ตรวจ private coverage แยกจากการกรองภาษา

## Credentials และการหมุนเวียน

- ตั้ง `STATS_READ_TOKEN` และ `STATS_PRIVATE_REPOSITORY_IDS` เป็น environment secrets ใน `profile-stats-read` ใช้ Fine-grained PAT ของเจ้าของบัญชี เลือกเฉพาะ private repos ใน allowlist และใช้ `Metadata: Read` ค่า IDs เป็น JSON array ของ numeric repository IDs [Environment settings](https://github.com/souruuu/souruuu/settings/environments) · [GitHub environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- เมื่อ PAT ใกล้หมดอายุ ให้ตั้ง token ทดแทนด้วยสิทธิ์และรายการเดิม รัน Verify แล้ว revoke token เก่าผ่าน GitHub UI เก็บค่า token และ IDs ใน secrets เท่านั้น ข้อมูลที่เผยแพร่คือสัดส่วนภาษารวม โดย Git history อาจใช้เปรียบเทียบผลรวมข้ามรอบได้

## ตรวจและกู้คืน

1. เปิด **Actions → Update profile statistics → Run workflow** บน `main` โดยปล่อย **Publish** เป็น false ตรวจว่า Generate ผ่าน coverage และ SVG validation ส่วน Publish ถูกข้ามและมี 0 artifacts
2. เมื่อจะอัปเดต SVG ให้รันบน `main` โดยเลือก **Publish** ตรวจว่า Generate และ Publish ผ่าน หากข้อมูลเปลี่ยน bot commit ต้องเปลี่ยนเฉพาะ `assets/stats/languages.svg` หาก SVG เหมือนเดิม logs จะแสดง `Language SVG is current.` และข้าม Push
3. ตรวจ event `schedule` บนหน้า Actions แยกจาก manual runs หาก API, coverage, validation หรือ fast-forward ล้มเหลว โปรไฟล์ยังใช้ SVG ล่าสุดที่เผยแพร่ได้ ให้ตรวจ sanitized logs และรันจาก `main` ล่าสุดเมื่อแก้สาเหตุแล้ว
4. หากต้องหยุดเผยแพร่ ให้ตั้ง `STATS_PUBLISH_LANGUAGES=false` หากพบข้อมูลที่ไม่ควรเผยแพร่ ให้ปิด gate ทันที ตรวจ logs, artifacts, history และ cache แล้วหมุนเวียน credential หากเกี่ยวข้อง การ revert บน `main` ใช้กู้ไฟล์ที่แสดง แต่สำเนาเดิมอาจยังอยู่ใน history หรือ cache

## การทดสอบและอัปเกรด

ใช้ Node.js 24 รันจาก root ของรีโป

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm audit --omit=dev
actionlint .github/workflows/update-stats.yml
git diff --check
```

คง Core และ `saxes` ตาม lockfile และ pin Actions ด้วย commit SHA เมื่ออัปเกรด Core ให้ตรวจ internal renderer imports, fixture SVG, filters และ validation ด้วย หากปรับข้อมูล language labels ให้เทียบ snapshot ของ Linguist และเก็บ MIT notice คู่กับข้อมูล [Core package](https://github.com/stats-organization/github-stats-extended/blob/2227c135447bff1547418a1a21f3405e4b0c282b/packages/core/package.json) · [Linguist definitions](https://github.com/github-linguist/linguist/blob/e0c78d62c42abae6122235d8e68a7aa43eef89da/lib/linguist/languages.yml)
