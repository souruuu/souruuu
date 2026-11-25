# GitHub Stats Automation

## สถานะและขอบเขต

Phase 1 มี workflow สำหรับ **Most Used Languages** และทดสอบ renderer ของ **GitHub Stats + Rank** ด้วยข้อมูลสังเคราะห์ ส่วน Stats/Rank และ Streak ยังรอข้อสรุปเรื่องขอบเขตข้อมูล private จึงยังไม่มี production collector หรือไฟล์สองการ์ดนี้ README migration เป็น change แยกหลังตรวจ operational run และได้รับอนุมัติ

ตรวจ Git ref และ GitHub REST API ของ `souruuu/souruuu` เมื่อ 25 พฤศจิกายน 2026 พบว่ารีโปเป็น public, default branch คือ `main`, HEAD คือ `776a133c57a11050ca07a7f274f4b2952b3c6f41`, README blob คือ `95d0074fc663c999716fdffb333779d4e2d1571b` และมี workflow กับ run อย่างละ 0

## สถาปัตยกรรมและเวอร์ชัน

- **Generate** ทำงานบน `souruuu/souruuu` ที่ `refs/heads/main` และ checkout ที่ event SHA ใช้ `GITHUB_TOKEN` แบบ `contents: read` สำหรับ checkout ติดตั้งด้วย lockfile และรัน tests ก่อนส่ง read secret ให้ collector ซึ่งใช้ GitHub REST API version `2022-11-28` การ Verify จะ render และตรวจ SVG ในหน่วยความจำ
- **Publish** รับ artifact ID จาก Generate ใน run เดียวกัน ตรวจ digest, ไฟล์ใน artifact, UTF-8 และ XML อีกครั้ง ใช้ `GITHUB_TOKEN` แบบ `contents: write` และ commit ในนาม `github-actions[bot]` เฉพาะ `assets/stats/languages.svg` ที่เปลี่ยนจริง Push แบบ fast-forward จาก event SHA หาก branch ขยับและชนกัน ให้เริ่ม run ใหม่จาก `main` ล่าสุด
- Schedule ใช้ `17 23 * * *` หรือ **06:17 น. เวลาไทย** ใช้ concurrency group เดียวทั้ง manual และ schedule โดยให้งานที่กำลังรันทำต่อจนจบ GitHub อาจแทนที่ run ที่กำลังรอ รันจริงอาจเริ่มช้ากว่าเวลา cron งาน Generate และ Publish จำกัดที่ 20 และ 10 นาทีตามลำดับ [Schedule และ default branch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) · [Concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

| รายการ | เวอร์ชันที่ใช้ |
| --- | --- |
| Node.js | `24.22.3` บน runner `ubuntu-24.04` |
| GitHub Readme Stats Core | `@stats-organization/github-readme-stats-core@2.3.1` จาก GitHub Stats Extended v2.3.1 ที่ `2227c135447bff1547418a1a21f3405e4b0c282b` (MIT) |
| XML parser | `saxes@6.0.0` (ISC) |
| GitHub Linguist | `v9.7.0` ที่ `e0c78d62c42abae6122235d8e68a7aa43eef89da` (MIT) ใช้เฉพาะ 141 ชื่อภาษาสาธารณะและสีที่ Core ไม่มี รวมเป็น 835 ชื่อ |
| actions/checkout | v7.0.1 · `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| actions/setup-node | v7.1.0 · `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| actions/upload-artifact | v7.0.2 · `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| actions/download-artifact | v8.0.2 · `9000827ccba6bdab643e8b6fd33ac0654aef8333` |

Core เปิด public API แบบ fetch-and-render ตัว adapter จึงใช้ไฟล์ build ภายในของเวอร์ชันที่ล็อกเพื่อเรียก renderers และ `calculateRank()` โดยตรง เมื่ออัปเกรด Core ให้ตรวจ internal paths, output schema และภาพตัวอย่างร่วมกัน รายชื่อ Linguist ใช้ key และ `color` จาก YAML ที่ pin ไว้ เลือกเฉพาะ key ที่ Core ไม่มีและใช้ `#858585` ถ้าต้นทางไม่มีสี เก็บ license คู่กับข้อมูล หาก GitHub คืนชื่อใหม่ให้ตรวจจาก Linguist แล้วอัปเดตชุดข้อมูลใน change ที่ผ่าน review [Core package](https://github.com/stats-organization/github-stats-extended/blob/2227c135447bff1547418a1a21f3405e4b0c282b/packages/core/package.json) · [Linguist language definitions](https://github.com/github-linguist/linguist/blob/e0c78d62c42abae6122235d8e68a7aa43eef89da/lib/linguist/languages.yml)

### ทางเลือกที่ประเมิน

| ทางเลือก | ผลจากการตรวจ source และ trade-off |
| --- | --- |
| GitHub Readme Stats Action v2.1.0 ที่ `2c498845f71017821efaad14293ebc736156ef21` (MIT) | รับ options แบบ query string หรือ JSON และส่งต่อ option ที่ README ใช้ให้ Core รองรับ `core_version` และ `fail_on_error` การติดตั้งของ action ใช้ frozen pnpm lock ขั้นแรก ส่วน Core ที่เลือกภายหลังติดตั้งด้วย `npm install --no-package-lock --ignore-scripts` ภายใต้ process environment ที่มี PAT แม้ pin Core โดยตรงแล้ว transitive resolution ยังลอยได้ ตัว action ส่ง error message และ secondary message เป็น outputs และ Core มีทางที่ log API errors โดยตรง การอ่าน private ยังขึ้นอยู่กับ token และ API ของ Core [Action source](https://github.com/stats-organization/github-readme-stats-action/blob/2c498845f71017821efaad14293ebc736156ef21/action.js) |
| GitHub Stats Extended v2.3.1 (MIT) | ใช้ `totalCommitContributions` และส่งเฉพาะ `from` สำหรับ `commits_year` จึงต้องกำหนด `to` เองเพื่อปิดช่วงปีให้ชัด `include_all_commits` ใช้ REST Search และนับอีกนิยามหนึ่ง ภาษาอ่าน 100 repos และ 10 languages ต่อ repo ใน GraphQL query เดียว การใช้ renderers ช่วยรักษาดีไซน์ ส่วน REST collector เพิ่มโค้ดที่ต้องดูแลและใช้ประมาณสอง API calls ต่อ repo เพื่อยืนยันตัวตนหลังอ่านภาษา [Stats fetcher](https://github.com/stats-organization/github-stats-extended/blob/2227c135447bff1547418a1a21f3405e4b0c282b/packages/core/src/fetchers/stats.ts) · [Languages query](https://github.com/stats-organization/github-stats-extended/blob/2227c135447bff1547418a1a21f3405e4b0c282b/packages/core/src/graphql/queries/top-languages.graphql) |
| GitHub Readme Stats ต้นฉบับ (MIT) | GitHub Releases API ไม่มี latest release โดย tag ที่พบสูงสุดคือ v1.1.6 ตรวจ source ปัจจุบันที่ `54a7985aeefda00d5eadb55b80c17c7f976c37d2` ซึ่งใช้ Node ≥22, Axios, dotenv, emoji-name-map และ dependency สำหรับตรวจชื่อผู้ใช้และตัดบรรทัด fetcher รุ่นที่ตรวจใช้ `totalCommitContributions` ตามปกติและ REST Search เมื่อเปิด `include_all_commits` ดีไซน์และโค้ดมีการแยกสายจาก Extended ที่ README ใช้อยู่ [Original fetcher](https://github.com/anuraghazra/github-readme-stats/blob/54a7985aeefda00d5eadb55b80c17c7f976c37d2/src/fetchers/stats.js) |
| GitHub Readme Streak Stats v1.8.2 ที่ `125aaaf200620410446ebfa51897fca3607e04fd` (MIT) | แยก SVG renderer ออกจากส่วนเก็บข้อมูลได้ แต่ตัวเก็บข้อมูล PHP ใช้ account-level calendar, log response ที่ decode ไม่สำเร็จ และข้ามปีที่ยังล้มเหลวหลัง retry รุ่นนี้ใช้ PHP ≥8.2, intl และ phpdotenv การ reuse renderer จะมีประโยชน์หลังแก้ขอบเขตข้อมูลและรับประกันความครบของประวัติ [Streak collector](https://github.com/DenverCoder1/github-readme-streak-stats/blob/125aaaf200620410446ebfa51897fca3607e04fd/src/stats.php) · [PHP manifest](https://github.com/DenverCoder1/github-readme-streak-stats/blob/125aaaf200620410446ebfa51897fca3607e04fd/composer.json) |

การคง SVG แบบ static ในรีโปใช้ Actions และลดการพึ่งพา image endpoints โดยมีค่า API calls และ runner time ต่อรอบ ส่วนการ deploy Core บน Vercel เพิ่ม runtime, secret และการดูแล endpoint โดยยังต้องแก้ปัญหา data scope ที่ fetchers อยู่ดี

## Metric definitions และขอบเขต

**Languages** รวม byte counts ของ GitHub Linguist จาก owned non-fork repos ที่เป็น public และ private repos ที่อยู่ในรายการอนุมัติ ตรวจจำนวน public repos เทียบกับข้อมูลเจ้าของบัญชีและตรวจว่าพบ private IDs ที่อนุมัติครบ ยืนยัน identity และ visibility ของทุก repo อีกครั้งหลังอ่านภาษา Repository ว่างหรือไม่มี language bytes อาจตอบ `{}` ได้ จึงตรวจเพิ่มว่ากลุ่ม private ที่อนุมัติรวมกันมี bytes จริง ใช้ `size_weight=1`, `count_weight=0` และเรียงกรณีเสมอด้วยชื่อ การ์ดแสดงสูงสุด 8 ภาษาแบบ compact โดยเปอร์เซ็นต์อิงผลรวม bytes ของ 8 ภาษาที่แสดงตาม upstream ตัวเลขสะท้อนองค์ประกอบของโค้ดที่ Linguist ตรวจพบ

**Stats/Rank** ตารางนี้บันทึกความหมายใน Core สำหรับวาง collector รอบถัดไป Production ยังต้องพิสูจน์ว่า metric ที่อิง repo มีข้อมูล public และเฉพาะ private repos ที่อนุมัติ โดยเฉพาะข้อมูลที่ GraphQL อาจตัดออกตามสิทธิ์

| Metric | ช่วงเวลาและที่มาของ upstream |
| --- | --- |
| Total Commits | GitHub Commit Contributions ตั้งแต่ 1 ม.ค. 00:00:00 UTC ถึงเวลารัน UTC ที่ความละเอียดหนึ่งวินาที ใช้ `from` และ `to` แบบ inclusive วันที่ 1 ม.ค. เวลา 06:17 น. ไทยยังเป็นปีเดิมใน UTC และขึ้นปีใหม่เวลา 07:00 น. ไทย Commit contributions อิงกฎ attribution และ branch ของ GitHub |
| Total PRs | PR ที่ผู้ใช้เปิดในทุก state ตลอดช่วงข้อมูลที่บัญชีเข้าถึงได้ |
| Total Issues | Issues ที่ผู้ใช้เปิดและอยู่ในสถานะ OPEN หรือ CLOSED ตลอดช่วงข้อมูลที่บัญชีเข้าถึงได้ |
| Total Stars Earned | ผลรวม stargazer count ปัจจุบันจาก owned repos ตาม upstream default เลือกขอบเขต private จากการอนุมัติ |
| Contributed to | Repo ที่ร่วมงานช่วงล่าสุดตาม `repositoriesContributedTo` สำหรับ COMMIT, ISSUE, PULL_REQUEST และ REPOSITORY upstream ระบุบนการ์ดว่า last year และเอา repo ของตนเองออก |
| Reviews | GitHub pull-request review contributions ในช่วง GraphQL default จากหนึ่งปีก่อนถึงปัจจุบัน เป็น input ของ Rank |
| Followers | จำนวน followers ปัจจุบัน เป็น input ของ Rank |
| Owned repos | จำนวน owned repos ปัจจุบัน Core รับเป็น input เพื่อ compatibility สูตรไม่ได้ใช้ค่านี้ |

ใช้ `calculateRank()` ของ Core ตรง ๆ โดย `all_commits=false` ค่า medians สำหรับ commits, PRs, issues, reviews, stars และ followers คือ 250, 50, 25, 2, 50 และ 10 ตามลำดับ Weights คือ 2, 3, 1, 1, 4 และ 1 ใช้ thresholds และระดับจาก Core ตามเดิม การใช้ commits ของปีปฏิทินและขอบเขต private ที่ได้รับอนุมัติจำกัดการเปรียบเทียบกับ rank ที่ใช้ rolling year หรือชุด repos อื่น Rank เป็นสถิติของ Core [Rank source](https://github.com/stats-organization/github-stats-extended/blob/2227c135447bff1547418a1a21f3405e4b0c282b/packages/core/src/calculateRank.ts) · [Profile contributions reference](https://docs.github.com/en/account-and-profile/reference/profile-contributions-reference)

**Streak** นิยามเดิมคือ Total Contributions, Current Streak และ Longest Streak ตลอดประวัติ ก่อนใช้ local renderer ต้องพิสูจน์วันต่อวันทุกปี รวม leap day, วันที่เริ่มบัญชี, วันนี้และเมื่อวาน โดยประเมินวันนี้ใน `Asia/Bangkok` และใช้ date label ที่ GitHub ให้มาสำหรับ contribution day ถ้า GitHub ปฏิทินยังไม่ถึงวันปัจจุบันตามเวลาไทย ต้องแยกกรณีที่กำลังข้ามเขตเวลาออกจากวันที่ข้อมูลหาย ส่วน current streak อนุญาตให้ต่อถึงเมื่อวานตามพฤติกรรม upstream ต้องมี coverage verification สำหรับแต่ละปีและ fail เมื่อ response ขาด API ไม่รับ selected repository IDs สำหรับ `contributionCalendar` จึงอาจรวม anonymized private activity นอกขอบเขตที่อนุมัติ เสนอคง Demolab endpoint เดิมชั่วคราวหากได้รับอนุมัติใน Phase 2 [GitHub contribution schema](https://docs.github.com/en/graphql/reference/users#contributionscollection) · [Streak source](https://github.com/DenverCoder1/github-readme-streak-stats/blob/125aaaf200620410446ebfa51897fca3607e04fd/src/stats.php)

## สิทธิ์ขั้นต่ำและข้อจำกัด

| Metric หรือขั้นตอน | สิทธิ์ที่ยืนยันหรือกำลังประเมิน |
| --- | --- |
| Languages และ repo identity | Fine-grained PAT, resource owner `souruuu`, Only select repositories, `Metadata: Read` |
| Stars สำหรับ Stats, Followers | REST repo metadata สำหรับดาวใช้ `Metadata: Read` ส่วน public followers ใช้ endpoint สาธารณะ ยังไม่ได้เปิด collector สำหรับ Stats |
| Commit contributions และ reviews | GraphQL ระบุว่า private/internal contributions ต้องใช้ optional OAuth scope `read:user` ซึ่งไม่ใช่ permission ที่ตั้งได้บน fine-grained PAT การ query แบบ grouped by repository ช่วยตรวจ scope และ truncation แต่ยังสืบทอด visibility ของ API เดิม ต้องพิสูจน์จากตัวอย่าง private ที่เจ้าของบัญชีทราบผลจริงก่อนพิจารณาออกแบบต่อ |
| PRs / Issues / Contributed to | GraphQL user connections ต้องยืนยัน private visibility และ pagination แยกตาม field ทางเลือก REST สำหรับข้อมูล private อาจต้องใช้ `Pull requests: Read` และ `Issues: Read` ตาม endpoint แต่ยังไม่มีการขอให้เพิ่มสิทธิ์ |
| Streak | ไม่มี permission สำหรับ selected-repo calendar ที่ยืนยันแล้ว การอนุมัติ private account-level activity เป็นการตัดสินใจแยกต่างหาก |
| Publish | `GITHUB_TOKEN` ของ profile repo, `contents: write` สำหรับ publish job |

ที่มา [List languages และ repo metadata](https://docs.github.com/en/rest/repos/repos#list-repository-languages) · [Get authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user) · [Private contributions ใน GraphQL](https://docs.github.com/en/graphql/reference/users#contributionscollection) · [Fine-grained PAT limitations](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens)

REST List Commits ต้องใช้ `Contents: Read` ซึ่งอ่าน source code ได้ โดยปกติ endpoint เริ่มจาก default branch การเก็บ branches อื่นต้องระบุ branch scope, นิยามการจับคู่ author กับบัญชี, การใช้ author date เทียบกับ committer date, pagination, การ deduplicate ด้วย SHA, ข้อจำกัดของ co-authorship และขอบปี UTC การทำครบยังให้นิยาม repository history ต่างจาก Commit Contributions ของ GitHub จึงต้องขออนุมัติทั้งเรื่องสิทธิ์และนิยามก่อนใช้ Classic PAT ที่ให้ account scopes หรือ `repo` มี blast radius กว้างกว่า fine-grained PAT จึงต้องพิจารณาแยกหาก API ทางเลือกแคบกว่าใช้งานไม่ได้ [List commits](https://docs.github.com/en/rest/commits/commits#list-commits) · [GitHub author date และ commit date](https://docs.github.com/en/account-and-profile/how-tos/contribution-settings/viewing-commit-details-from-your-timeline)

## ตั้งค่าและตรวจครั้งแรก

1. Review Phase 1 และ merge หลังได้รับอนุมัติ ตรวจว่า `main` เป็น branch ที่ผ่าน review และจำกัดสิทธิ์ผู้ที่เปลี่ยน workflow หรือค่าเปิดการเผยแพร่
2. เจ้าของบัญชีสร้าง fine-grained PAT ผ่าน GitHub UI โดยเลือก resource owner และ private owned non-fork repos ตามที่อนุมัติ กำหนดวันหมดอายุและใช้ `Metadata: Read`
3. ตั้ง Actions secrets `STATS_READ_TOKEN` และ `STATS_PRIVATE_REPOSITORY_IDS` ใน Settings ของ profile repo รายการ IDs เป็น JSON array ของ REST repository IDs เช่น `[123456789,987654321]` ซึ่งเป็นตัวอย่างสมมติ เจ้าของ repo หา ID ได้บนเครื่องตนเองด้วย `gh api repos/souruuu/REPOSITORY --jq .id` จากบัญชีที่เข้าถึง repo นั้นได้ ตั้งทั้ง token และ IDs ใน secret UI
4. เปิด **Actions → Update profile statistics → Run workflow** บน `main` โดยปล่อย **Publish** เป็น false ตรวจข้อความผ่าน coverage และ SVG validation พร้อมยืนยันว่าไม่มี artifact และไม่มี publish job รอบนี้ตรวจทุก ID ที่อนุมัติและ require private bytes รวมเป็นบวก ผู้ใช้ตรวจรายการ repo ในหน้าตั้งค่า PAT กับรายการ IDs และตรวจตัวอย่างภาษาจาก GitHub ภายในบัญชีตนเองเพื่อยืนยัน expected coverage
5. เมื่ออนุมัติให้ออกเผยแพร่เปอร์เซ็นต์รวมแล้ว ให้ตั้ง Actions repository variable `STATS_PUBLISH_LANGUAGES=true` รัน manual บน `main` โดยเลือก **Publish** ตรวจ run, logs, artifact และ commit บน GitHub ภายใน artifact ต้องมีเพียง `languages.svg` ตรวจภาพจริงกับการ์ดเดิมและรอ scheduled run สำเร็จอย่างน้อยหนึ่งครั้ง
6. ขออนุมัติ Phase 2 หลังตรวจความถูกต้องและภาพบน GitHub แล้ว เปลี่ยนเฉพาะ src ของการ์ดที่ผ่านการตรวจเป็น path ในรีโป คง 49% / 49% / 55%, alignment และจำนวน 3 การ์ด หาก migration ใช้ fallback สำหรับ Stats หรือ Streak ให้ระบุไว้ใน review

## การป้องกันข้อมูลและการกู้คืน

- Collector ส่ง PAT เฉพาะ `https://api.github.com` ผ่าน Authorization header, ปิด redirects และ retry แบบจำกัดเมื่อเจอ transient failure ส่วน stdout/stderr ใช้ข้อความคงที่และสถานะ HTTP ไม่มีชื่อ repo, raw responses หรือ payloads ที่ parser ปฏิเสธ ตัว renderer รับเฉพาะชื่อภาษาจากชุดข้อมูลสาธารณะและ aggregate bytes
- XML validation ตรวจโครงสร้างกับ output ของ renderer ที่ pin รวมถึง namespace, CSS คงที่, internal mask reference, สี และตัวเลขที่แสดง ปฏิเสธ DTD, processing instructions, XML comments, สคริปต์, handlers, external references และ metadata นอกโครงสร้างที่คาดไว้ Artifact สร้างได้หลังเปิด release เท่านั้นและหมดอายุหนึ่งวัน ผู้ที่อ่าน public repo ได้สามารถดาวน์โหลด artifact ได้ และผลรวมใน Git history อาจใช้เทียบการเปลี่ยนแปลงข้ามวัน [Artifact access](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)
- `npm ci --ignore-scripts` ใช้เวอร์ชันและ integrity ของทั้ง 31 packages จาก lockfile มีแพ็กเกจที่ประกาศ install scripts ใน lockfile 0 ตัว ตรวจ npm audit ก่อนเปลี่ยน dependency การ install และ test เกิดก่อน step ที่ได้รับ PAT ส่วน publish job ใช้ token ของ profile repo เท่านั้น
- เมื่อ API, permission, coverage, rate limit, artifact หรือ validation ผิดพลาด ให้แก้สาเหตุแล้วรันจาก `main` ใหม่ ไฟล์ล่าสุดบน remote ยังอยู่เมื่อ push ไปไม่ถึง ถ้า branch rules ไม่อนุญาตให้ bot push ให้ตรวจ rules กับเจ้าของรีโปก่อนเปลี่ยนแนวทางเผยแพร่
- เมื่อ token หมดอายุ ให้ rotate ด้วย repo selection และสิทธิ์เดิม ตั้ง secret ใหม่ รัน Verify แล้ว revoke token เก่าผ่าน GitHub UI
- หยุด schedule โดยเอาค่า `STATS_PUBLISH_LANGUAGES=true` ออกและ disable workflow หากจำเป็น ย้อน asset commit ด้วย reviewed revert หรือ restore รุ่นที่ตรวจแล้ว ย้อน README migration แยกจาก automation และย้อนไปยัง lockfile กับ action SHAs รุ่นที่เคยตรวจผ่าน ใช้ประวัติ Git ปกติ
- หากพบการเผยแพร่ข้อมูลที่ไม่ได้รับอนุญาต ให้ปิด workflow, revoke token, ประเมิน logs/artifacts/history และลบ artifact ตามขอบเขตที่ทำได้ การ revert ไฟล์ไม่ได้ลบสำเนาจาก public Git history หรือ cache ให้จัดการ incident แยก

## การทดสอบ

รันจาก root ของรีโปด้วย Node.js 24

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm audit --omit=dev
actionlint .github/workflows/update-stats.yml
git diff --check
```

Tests ใช้ synthetic fixtures ครอบคลุม REST pagination, scope, byte weights, partial/malformed responses, retry, year rollover, leap day, UTC เทียบกับเวลาไทย, rank equivalence, การแยก commits จาก contributions, SVG validation และ Git publish behavior การทดสอบ private Streak history, run ที่ใช้ token จริง, bot push บน GitHub, การแสดงผลภาพจริง และ scheduled run ยังรอ operational verification
