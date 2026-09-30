# ⚠️ TÀI LIỆU LỊCH SỬ — MỘT PHẦN ĐÃ BỊ BÁC BỎ, MỘT PHẦN ĐÃ SAI

> Bản đầy đủ của nó vẫn ở `.research/full-report.md`. Bản này là bản biên tập có phần 0.
>
> **Đừng dùng nó làm nguồn chân lý.** Nó đã bị ba đợt nghiên cứu (109 agent, 16,7M subagent
> token) đọc ngược lại. Cụ thể:
>
> · **§4 §3 — "đóng khung theo khu vực, phủ định canvas vô hạn" — SAI.** Nó dựa trên
>   `ART-DIRECTION-SAND.md`, nghiên cứu về **沙画** (hội họa trên cát). Hướng nghệ thuật thật là
>   **沙雕修仙动画**, và canvas vô hạn đã có sẵn + có test. **Xem `TERMINOLOGY-沙雕.md`.**
> · **Các con số trong §11 "Danh sách số phải khớp"** — chính §12 thừa nhận không có nguồn.
> · **Nhiều claim ở Phần 1–3 đã bị đổi đơn vị** khi `RECONCILIATION.md` chốt lượt là đơn vị
>   duy nhất. Số của §2.2 chia lại 4 nếu `TURN_WALL_SECONDS` là 30 chứ không phải 120.
>
> **Dùng thay bằng**: `GENRE-CANON.md` · `RPG-SUBSTRATE.md` · `OPEN-QUESTIONS.md` ·
> `REFUTATIONS.md`. Đọc `REFUTATIONS.md` **trước**, vì nó ghi những gì đã bị bác.
>
> **`ART-DIRECTION-SAND.md` và `STORY-SAND-NARRATIVE.md` đã bị xoá.** Các trích dẫn tới chúng
> trong văn bản này là tham chiếu lịch sử, không phải nguồn còn tồn tại.

---

# ĐẠO LỘ: VẠN TIÊN — Báo cáo thiết kế

**8 section, 9 agent, 1,58M subagent token.** Mỗi section 25.000–50.000 ký tự, viết
từ 122k ký tự nghiên cứu và đọc chính repo này trong lúc viết.

> **Bốn chỗ trong báo cáo này mâu thuẫn với nhau, và một trong số đó đã được tìm ra
> rồi.** Chúng nằm ở phần 0, không phải cuối. Đọc phần 0 trước khi đọc phần 1.

---

# PHẦN 0 — CRITIC, VÀ NHỮNG CHỖ NÓ ĐÚNG

Một agent đọc toàn bộ tám section, dự đoán trước rằng mâu thuẫn chéo section là
"failure mode đặc thù của soạn song song", rồi **tìm ra chính xác điều đó**.

## 0.1 Một lượt dài bao nhiêu? Năm con số, không cái nào giống cái nào

Đây là mâu thuẫn nền, vì **mọi tuyên bố phạm vi phiên đều thừa hưởng từ nó**.

| Section | Nói | Lượt/phiên |
|---|---|---|
| Agent chơi §2 | 12 s/lượt [SUY] | 300 |
| Tu luyện §7.6 | 25 s/lượt (600÷24) | 144 |
| Vòng lặp §2.1 | 120 s/lượt | 30 |
| Bản đồ §5.1 | 600 s `[ĐO]` | 6 |
| Cốt truyện §1.2 | 600 s = 10 phút thật | 6, nhưng §2.2 vẽ **4** |

Cốt truyện mâu thuẫn **với chính nó**: 600 s × 4 lượt = 2.400 s, phiên 3.600 s →
**1.200 s không thuộc lượt nào**.

Và các con số phái sinh **tương phản**, không chỉ khác:

| Đại lượng | Tu luyện | Vòng lặp |
|---|---|---|
| Gate 突破 | **222 lượt** (5.555÷25) | **46,3 lượt** (5.555÷120) |
| Ván 金丹 | 33,3 phiên | 33,3 phiên |

Cùng một phép chia, hai đơn vị. Và nếu 1 lượt = 600 s thì **1 ngày = 5.555 s chứ không
phải 600**, nên đơn vị thời gian đã đổi — và không section nào nói.

**Sửa:** một bảng hằng số duy nhất ở đầu report. Mọi section tham chiếu, không viết
lại. Đây là việc biên tập viên làm trong một giờ và tác giả tự làm thì không bao giờ.

## 0.2 Nguyên thủy visibility: bốn kiểu, và hai bên đối nghịch về mặc định

| Section | Kiểu | Mặc định |
|---|---|---|
| Ba khán giả §1 | `Scope` 6 thành viên, `Scoped<T>` | **không có** |
| Agent chơi §1.2 | `Audience` 5 thành viên, `Field<T>` | không nói |
| Tu luyện §7.0 | `vis: {self} \| {own-sect} \| {world} \| {spectator}` | **`{world}`** |
| Sản xuất §2.1 | `Visibility`, `Field<T>` | không nói |

> Ba khán giả: *"**no default** … mặc định còn lại sẽ là `arena` … **Default-deny là
> hướng duy nhất để một chú thích bị quên fail an toàn**."*

> Tu luyện: *"Mặc định `{world}` phải được trả tiền."*

**Default-deny vs default-allow.** Một protocol không thể có hai lời.

## 0.3 Cơ chế chống gian lận không có trong schema

`Ba khán giả` §7.3 thiết kế `verify(subject, claimRef, method)` — câu trả lời cho
"một agent đoán ra field ẩn thì có gian lận không", với ledger công khai giá 0 và
kiểm chứng thật giá 220 靈石.

**`verify` không nằm trong union 16 verb.** Cơ chế duy nhất chống gian lận không có
schema. Agent sẽ không bao giờ gọi nó.

## 0.4 Tiền tệ trung tâm của kinh tế không có action sinh ra nó

`Kinh tế` ghi: nghiên cứu gọi 貢獻點 là **thiết bị coupling chứ không phải tiền tệ —
0 lần xuất hiện**. Rồi dựng 6 quy tắc thưởng, ledger 447 vào / 453,3 ra mỗi phiên.

`set_production` và `award` **không có verb nào** trong union 16. Sáu quy tắc thưởng
đều kích hoạt bởi hành động mà schema không có. **Một phiên không thể kiếm được
một 貢獻點.**

Và §11 đặt tên bảng là *"Danh sách số phải khớp"* rồi in 447 / 453,3 / 1,4% / 16,8% —
những con số §12 thừa nhận *"không có nguồn"*. Bảng tổng kết biến phép đo thành luật định.

## 0.5 Duty cycle: sáu mục tiêu, hai cái loại trừ nhau

0,9944 (Kinh tế) · 0,80 (Sản xuất) · 0,80 (Agent chơi) · 0,50 (Vòng lặp) ·
≤0,833 (Ba khán giả) · 1,00 (Tu luyện)

Và trực tiếp mâu thuẫn: Tu luyện §7.6.5 nói một bức tường **huỷ được** có duty
cycle 100%, trong khi Vòng lặp §2.3 nói 隐忍 **bắt buộc** phải là lượt không có gì
đổi và *"Game có `D_machine = 100%` **không diễn được 隐忍**."*

Hai điều kiện loại trừ **trực tiếp đối nghịch** về cùng một cơ chế. Một trong hai phải
bị bỏ, và cái nào bị bỏ quyết định 隐忍 còn hay không.

## 0.6 Retry: giữ transcript hay coi là không xảy ra

> Agent chơi: `| 'retried' // đã khôi phục snapshot, lượt này chưa từng xảy ra`

> Sản xuất: *"**Không roll back transcript** … ngữ cảnh của lượt retry được dựng lại
> từ typed projection của snapshot."*

Cả hai không thể đúng. Replay là hàm thuần của log bền, sắp theo `sequence`. Giữ
transcript thì người xem thấy những lượt không bao giờ xảy ra; không giữ thì người
xem thấy lỗ hổng trong `sequence`.

Cùng loại: `Kinh tế` cho phép uy tín **phai sau 30 ngày**, còn `Ba khán giả` đòi TTL
tính từ `occurredAt` để replay là hàm thuần. **Report áp dụng chính sách determinism
cho TTL và bỏ nó cho decay.**

## 0.7 Số đo không khớp giữa hai section

| | Ba khán giả §2 | Agent chơi §2 |
|---|---|---|
| Turn context | 1.635 B ≈ 545 token | ≈1.287 token (o200k) |
| Payload người đọc | **325 B < self 401 B** | **1.572 token > agent 1.287** |

Hai section đo hai thứ khác nhau — event vs turn — và **không section nào nói điều đó**,
trong khi cả hai đều được trích như *"chi phí của 扮猪吃虎"*. Hướng chênh lệch **ngược
nhau**: một cái nói người đọc nhỏ hơn agent, cái kia nói lớn hơn 22%.

Hệ quả: chi phí phiên (417.600 token) tính từ turn nhỏ; tỉ lệ context phải bảo trì
để giữ lời nói dối (15,3%) tính từ turn lớn. **Hai con số cùng hệ thống, hai đơn
vị turn, không ai đối chiếu.**

## 0.8 Điều cần quyết định trước khi viết code

1. **Độ dài lượt** — chốt một con số, mọi thứ tính lại từ nó
2. **Default của visibility** — deny hay allow. Tôi nghiêng về **deny**, vì lập luận
   "quên chú thích phải fail an toàn" là lập luận của người đã bị repo này sửa
3. **Retry** — giữ transcript, và chấp nhận người xem thấy lượt không xảy ra; hay
   cắt, và chấp nhận lỗ hổng sequence
4. **隐忍** — còn là lượt trống, hay bỏ khái niệm

---



---

# PHẦN 1 — Sản xuất — công cụ, hình ảnh, và thứ chưa quyết

# Sản xuất — công cụ, hình ảnh, và thứ chưa quyết

Bốn món đồ để dựng: **schema công cụ** (hợp đồng với agent), **renderer** (một state → JSON, theo người xem), **hình ảnh**, và **lát cắt dọc đầu tiên**. Mọi thứ dưới đây phụ thuộc một quyết định của operator đã chốt: **field visibility per-viewer là nguyên thủy của API, không phải sự hiện diện của field**. Tôi không viết lại quyết định đó, tôi chỉ làm nó thành thứ build được.

---

## 1. Schema công cụ như một sản phẩm build

### 1.1 Bốn mối chốt đã có sẵn trong repo, dùng lại thay vì sáng mới

Repo này đã trải phí cho từng mối chốt dưới đây một lần rồi. Đừng phát minh biến thể thứ hai.

| Mối chốt | Giá trị / hình dạng | Vì sao có, và ai đã trả giá |
|---|---|---|
| Id có namespace | `ACTION_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/`, dùng chung cho action / capability / hook provider qua `NAMESPACED_ID_PATTERN` | `claim` trần sẽ đụng nhau ngày có hai feature cùng có một; va chạm hiện ra **lúc dispatch** dưới dạng một feature âm thầm trả lời thay feature kia. Ba regex từng trôi lệch nhau, nên `vendor.some-cli` là hook provider hợp lệ và là action không hợp lệ — và mỗi file có một comment khẳng định chúng là cùng một luật |
| Khai báo action | `defineAction<I,O>({ id, permissions, description, run })` — ném lỗi lúc **authoring time**, không phải lúc chạy | Hai cách registry đi sai thật sự: id dở dạng, và `permissions: []` — một action không ai cấp quyền là action không ai gọi, trông y như feature hoạt động chỉ vì không bao giờ được gọi |
| Union được sinh | `packages/protocol/src/generated/action-ids.ts` từ manifest `*_ACTION_IDS` của từng feature; **output được commit**; file sinh ra **không import gì cả** | Không có type nào compiler thấy là hàm của tập action quyết định lúc runtime. Một file sinh chỉ tồn tại sau build là file mà sự vắng mặt của nó không ai nhận ra. Không import là để `packages/api` dùng được mà không phụ thuộc feature — file sinh mà nêu nguồn thì lấp cửa sau |
| Cổng của nó | `scripts/check-codegen-fresh.sh`, chạy trong `codegen-drift` của `scripts/stages.manifest` | So **nội dung**, không gọi `git diff`: runner chạy trong container, dựa vào git là giả định về môi trường; và so nội dung nói đúng ý nghĩa. Cây được khôi phục nguyên trạng kể cả khi thất bại — **một gate tự sửa thứ nó đang kiểm thì thôi không còn là gate**, vì lần sau nó xanh trên bản sửa chứ không phải trên trạng thái đã commit |

Điều đáng chép nhất trong `generate-action-ids.ts` là lỗ hổng mà chính nó nêu: `MANIFESTS` là **danh sách viết tay**, và danh sách viết tay đúng là cái lỗ mà cả cơ chế sinh code này sinh ra để bịt. Feature thứ năm thêm `BOUNTY_ACTION_IDS` vào manifest, đăng ký, và ship — union âm thầm bỏ qua nó, `act()` từ chối một id hợp lệ lúc runtime, và đảm bảo cấp kiểu im lặng ngừng phủ feature đó. Tệ hơn: **không gate nào bắt được**, vì codegen tái tạo đúng cái thiếu đó, nên một gate chạy codegen rồi diff vẫn xanh trên một union thiếu nguyên một feature. Cơ chế đã sửa bằng **discovery trên filesystem**, khẳng định hai danh sách phải khớp trước khi ghi bất cứ thứ gì.

→ **Lệnh build cho ĐẠO LỘ: schema công cụ sinh từ manifest theo đúng đường đó, output commit, khám phá feature từ filesystem chứ không từ danh sách viết tay, và được stage `codegen-drift` hiện có phủ miễn phí.** Đừng viết một gate mới; cái cũ đã đúng và đang chạy.

### 1.2 12–16 action khai báo vs ~5 action chiếu — và vì sao không phải mâu thuẫn

`AGENT-PLAYER-DESIGN.md` §7 yêu cầu **12–16 action**. `arXiv 2605.24660` đo **Fixed-K=5 thắng cả ba phép so trên aggregate**: ToolBench 64,7% vs 61,9%, BFCL found-rate 97,5% vs 85,0%, downstream end-to-end 73,3% vs 71,7% (MEASURED). Người đọc brief thấy mâu thuẫn; nó không có. **Schema là tập khai báo; projection là tập chiếu.** 12–16 là bảng tra cứu của engine, ~5 là thứ agent thấy mỗi lượt.

Phần khó là chọn **cái gì quyết định biên 5**. Brief chính thức bỏ qua chỗ này, và critic nêu đúng: `2606.06284` (lọc theo causal frontier) và `2605.24660` (cố định K≈5) **khuyến nghị ngược nhau**, và rule tổng hợp âm thầm chọn cái thứ nhất mà không nói mình chọn gì. Tôi chọn, và lý do nằm trong chính caveat của CMTF:

| Nghiên cứu | Điều kiện | Thành công | Token/nhiệm vụ | Vấn đề |
|---|---|---|---|---|
| `2606.06284` (102 nhiệm vụ, 100 tool, 4 backbone, 2.448 lượt) | hiện cả 100 tool | 0,83 | 24.569 | — |
| | chỉ tool **thực thi được** | **0,65** | 4.354 | tệ hơn không lọc |
| | chỉ **bước nhân quả kế tiếp** | **0,99** | 2.405 | **nhánh frontier được BFS từ goal state đã biết, tool mock, không CI, không seed, và 0,83→0,99 gần như toàn bộ đến từ một model yếu** |
| `2605.24660` (tool-calling, **không phải game**) | Fixed-K=5 | thắng cả 3 | — | nhưng adaptive **thắng** ở K=5 (60,9% vs 47,8%) rồi **thua** end-to-end — vì nó hy sinh recall |

Con số **0,99 là của một oracle**. Một game không có BFS từ goal state đã biết; game *là* nơi goal state phải được khám phá. Đó là lý do duy nhất tôi chọn cố định K≈5: **bài có kết quả cao nhất dựa trên thông tin mà hệ thống không có.** Ngược lại, `2605.24660` thắng end-to-end ở môi trường thật với recall thật — đó là môi trường của game. Chọn theo cái nào không cần oracle, không theo cái nào có bảng đẹp hơn.

Hai hệ quả thiết kế, cả hai đều là **điều kiện không lọc theo pháp lý**: một action hợp lệ mà resolve xong không đổi gì là **một kết quụ riêng, đáng chấm**, không phải thành công; và `2605.24660` nói rõ BoR tối ưu *selectivity* chứ không phải recall — **hẹp danh sách để cứu độ chính xác chọn là chính sách phục hồi đuôi, không phải chiến lược miễn phí.**

### 1.3 Chính sách phiên bản, và cách đưa một breaking change tới agent đang chạy

Ba con số phiên bản, ba việc khác nhau. Repo đã học bài này bằng cách **tạo ra một file riêng** chỉ để nói nó: `extension-contract.ts` tồn tại vì *"conflating the two is the mistake this file exists to prevent"*.

| Hằng | Giá trị hiện tại | Nó phiên bản cái gì | Nhịp đổi | So sánh |
|---|---|---|---|---|
| `PROTOCOL_VERSION` | `0.1.0` | union `AgentEvent` + shape batch trên mặt phẳng telemetry | thường, mỗi lần wire đổi | exact-match, cưỡng chế lúc ingest vì server nhìn thấy con số agent gửi |
| `EXTENSION_CONTRACT_VERSION` | `0.1.0` | shape `GameFeature` + `createRuntime` | hiếm, có chủ đích | exact-match, vì bề mặt **đóng băng**, và so sánh hữu ích là bằng chứ không phải một khoảng phải mã hoá phỏng đoán |
| `TOOL_SCHEMA_VERSION` (mới) | `0.1.0` | tập action + shape của payload lượt | theo nhịp content | `^` trong một major, exact-match giữa các major |

Quy tắc phân loại, viết để một người không có context cũng phân loại đúng:

| Thay đổi | Major hay minor | Ví dụ |
|---|---|---|
| Thêm action mới, không action nào cũ đổi nghĩa | minor | thêm `cultivate_alchemy` |
| Thêm field tùy chọn vào payload lượt | minor | thêm `evaluated_at` |
| Đổi tên field, đổi đơn vị, đổi tập giá trị enum, thêm bắt buộc | **major** | `qi` → `lingqi` |
| Bỏ một action, hoặc làm một action thành no-op | **major** | bỏ `press` |
| Đổi nghĩa một field mà agent **đọc** | **major** | `trust` từ tổng liên tục thành ngưỡng hiện tại |

Dòng cuối là dòng quan trọng nhất, và nó không phải về kỹ thuật. `arXiv 2604.02668` đo: prior độ tin cậy **tính trước, do hệ thống cấp** nâng độ chính xác đa số **10,5 điểm tuyệt đối**. Critic nêu đúng rằng brief đảo ngược cơ chế này để biện minh cho kiến trúc chữ ký trên danh hiệu tự khai — hướng đúng là **prior không thể giả mạo**, và một field đổi nghĩa âm thầm là đúng cái làm prior trở thành prose tự khai. Với ĐẠO LỘ, hệ quả là: **mọi thứ agent tối ưu theo phải là field hệ thống sinh, không phải thứ agent tự khai** — kể cả 法名/道號, và kể cả `trustScore`.

**Cách đưa breaking change tới agent đang chạy: admit-once.**

Quy tắc 43 giây đã ship và đã tài liệu hoá — *"thế giới không dừng khi model suy nghĩ, lệnh rơi vào một bàn đã 43 giây cũ hơn cái nó đã đọc"*. Một lượt đã được nhận thì đã đọc một thế giới; đợi nó lâu hơn thế không thay đổi được thứ nó đã tin. Vậy nên:

1. **Lượt được nhận dưới đúng một version, ghi version đó vào bản ghi lúc nhận.** Không bao giờ dịch lại. Đây là câu trả lời duy nhất an toàn với quy tắc 43 giây.
2. **Điểm cắt là một `WHERE`, không phải một cờ.** Version nằm trên từng bản ghi, nên lượt đang bay lúc version đổi vẫn tồn tại và vẫn resolve được. Không có câu hỏi "chuyện gì xảy ra với lượt đó" vì không có trạng thái trung gian để hỏi.
3. **Lượt quá cũ bị từ chối bằng lỗi có kiểu, mang cả hai version.** `ExtensionContractMismatch` đã làm đúng việc này và nói rõ vì sao: *"the only useful thing a caller can do with the failure is decide whether to upgrade the host or pin the extension, and neither is possible without knowing which side is behind."* Lỗi phải mang `declared` và `expected`.
4. **Cửa sổ chồng được đo bằng lượt, không bằng ngày.** Không có gì trong toàn bộ nghiên cứu được mệnh liệu bằng wall-clock — đó chính là phát hiện của critic — nên "phục vụ song song 30 ngày" là một câu không kiểm được. Hãy dùng: **phục vụ version cũ cho tới khi số lượt đã phục vụ trên nó vượt 10× số lượt dài nhất quan sát được của một phiên (6), tính riêng cho từng agent còn sống** — rồi log danh sách agent đã ở giữa lượt khi cắt. Với 6 lượt/phiên, đó là 60 lượt mỗi agent.
5. **Agent không được tự chọn version.** Version là của cái bàn đã nhận lượt. Nếu agent chọn được, nó chọn bản cũ mãi và không bao giờ học cái mới.

### 1.4 Ba gate của schema, và cách biết chúng có thể đỏ

`AGENTS.md`: *a gate that cannot fail is worse than no gate*. Nên mỗi gate dưới đây đi kèm thao tác phá thứ nó giữ, và phải thấy đỏ trước khi tin.

| Gate | Khẳng định | Đổi thứ nó giữ, phải thấy đỏ |
|---|---|---|
| `codegen-drift` (đã có) | union action đã commit khớp output của codegen | thêm `AGENT_ACTION_IDS` vào manifest của một feature mà không chạy `pnpm codegen` |
| `no-unregistered-feature` | generator **từ chối phát ra** union thiếu feature | tạo feature thứ 14 có manifest, không đăng ký — phải đỏ, không được âm thầm bỏ qua |
| `no-orphan-action` | mỗi action trong schema có ít nhất một feature đăng ký, và id có action-id tương ứng trong union | khai báo `defineAction` với id không nằm trong manifest |
| `version-monotone` | `TOOL_SCHEMA_VERSION` chỉ tăng, và một bump major kèm một dòng trong `CHANGELOG-SCHEMA.md` ghi **agent nào hỏng** | hạ version, hoặc bump major không ghi dòng |

Và một cảnh báo mang từ `AGENTS.md`, áp dụng nguyên văn: **một check không được giả định mọi feature đều cài.** `removal-test.sh` bóc từng feature và chạy unit suite, nên bất kỳ test nào đọc `packages/features/*/src` ở đường dẫn cố định đều đỏ trên chính cái removal nó sinh ra để chứng minh sạch. Schema check phải **liệt kê feature từ filesystem và khẳng định union vẫn đóng khi thiếu một feature** — đây cũng chính là lỗi `any` ở biên, lớn thêm một tầng: một khẳng định về cả hệ thống với tay qua một seam hệ thống dựng ra để có.

---

## 2. Renderer: một state, một projection, một giao diện duy nhất

### 2.1 Kiểu

```ts
export type AgentId = string & { readonly __brand: 'AgentId' };
export type SectId  = string & { readonly __brand: 'SectId'  };

/** Ai đang hỏi. Không có loại thứ tư, và không có "mọi người". */
export type Viewer =
  | { readonly as: 'agent';      readonly id: AgentId }
  | { readonly as: 'spectator';  readonly seat: string }
  | { readonly as: 'engine' };

/**
 * Field này dành cho ai. Tên thành viên enum là TÊN KHÁN GIẢ, nên một field
 * chỉ người đọc có thể viết ra mà không phải nói ra rằng mình viết cho người.
 *
 * { to: 'spectator' } CHÍNH LÀ 扮猪吃虎. Nó là biến thể duy nhất trong kiểu này
 * mà không một agent nào đọc được, và nó không cần thêm cơ chế nào.
 */
export type Visibility =
  | { readonly to: 'agent';      readonly of: 'self' }
  | { readonly to: 'agent';      readonly of: 'sect'; readonly sect: SectId }
  | { readonly to: 'agent';      readonly of: 'any' }
  | { readonly to: 'spectator' }                       // ← 扮猪吃虎
  | { readonly to: 'engine' };

/** Mọi giá trị thế giới đều mang tầm nhìn. Một con số trần không phải giá trị thế giới. */
export interface Field<T> {
  readonly value: T;
  readonly seenBy: Visibility;
}

export type Projection = Readonly<Record<string, unknown>>;

/** Giao diện DUY NHẤT của renderer với phần còn lại của hệ thống. */
export function project(world: WorldState, viewer: Viewer): Projection;
```

Ba điều kiện phải được giữ khi viết, vì cả ba đều là lỗi đã được một nghiên cứu thật đo:

**Một — field bị giấu phải VẮNG, không được là `null`.** `null` bảo agent "ở đây có thứ gì đó". Một cánh cửa khóa là thông tin; 扮猪吃虎 cần một **bức tường**, không phải một cánh cửa có khóa. Bộ gate phải phủ định mọi hình thức chặn: `null`, `undefined`, `"—"`, `0`, `[]`, `{}`. Không có ngoại lệ.

**Hai — giá trị bị giấu không được rò qua chỗ khác.** Một giá trị có thể lộ bằng cách được nhúng vào một con số khác. Gate nên kiểm tra chuỗi JSON của projection, không chỉ key của field.

**Ba — mọi con số phải gate cái gì.** Ability Rating của ACS là bằng chứng: *"is not used in success rate or skill ability calculations… It's strongly recommended to refer to Skill Level and Five Attributes instead"* (MEASURED, từ wiki dịch ngược code). Nó hiện lên màn hình, agent nhìn thấy, và tối ưu sai với sự tự tin tuyệt đối. Vì vậy:

> **Một con số xuất hiện trong projection của V nếu và chỉ khi nó là một toán hạng trong ít nhất một chuỗi công thức mà projection của V cũng chứa.**

Cái này biến "đừng bao giờ hiện một số danh hiệu nó không gate gì" từ một ghi chú chính sách thành thứ **không ship được**. Mốc không trả thưởng (bậc 0 = 300.000 điểm Kim Cơu, *"not linked to the achievement system, and the tier is still treated as Tier I in all functional purposes"*) cũng chết theo cùng cách.

### 2.2 Projection là một sản phẩm, và nó có budget

| Số | Nguồn |
|---|---|
| 24.569 token / nhiệm vụ khi đưa hết 100 tool | CMTF, MEASURED |
| 2.405 token / nhiệm vụ khi chỉ chiếu causal frontier | CMTF, MEASURED — chênh **10,2×** |
| ~5 action chiếu mỗi lượt | `2605.24660`, MEASURED |
| **≤ 4.000 token / lượt** | **mục tiêu của renderer** (INFERRED, neo vào 2.405) |
| Không transcript thô giữa hai quyết định | hợp đồng bounded-context, AgenticSTS (`arXiv 2607.02255`, 298 trajectory có thẻ) |

Cái thứ tư là **một hằng trong renderer, không phải một lời nhắc trong prompt** — vì BALROG đo rằng model *"tend to ignore even the hints directly present in the input prompt"*, và GPT-4o chết vì ăn đồ ăn thối **dù khi được hỏi riêng thì nó tự nói đó rất nguy hiểm** (định tính; và phần "ăn quá nhiều" trong claim gốc bị chính Table 16 phủ nhận, 7/7 model ✔). Trần token là một `if` trong `project()`, không phải một câu trong prompt. Khi vượt, `project()` **cắt theo thứ tự ưu tiên khai báo** và gắn cờ `truncated: [...]` vào payload — cắt im lặng là cách chắc chắn nhất để tạo một agent chết không hiểu vì sao.

### 2.3 Ranh giới của renderer

`project()` import `core` và `protocol` và **không gì khác** — đúng luật của repo. Feature khai báo field của nó qua registry; renderer đi qua registry. Nếu renderer biết tên một feature, nó đã vỡ seam, và kiểu `any` ở đây là một bug report chưa được gửi.

---

## 3. Duty cycle — con số quyết định game này có chơi được bằng agent hay không

Không gì trong nghiên cứu được mệnh liệu bằng wall-clock hay token. Đây là lần học thứ nhất, và nó phải là phép tính chứ không phải một ý kiến.

**Bước 1 — đơn vị.** Một ngày trong game = 600 giây (MEASURED, ACS). Một phiên = 60 phút = 3.600 giây. **Giả định 1:1 giữa giây trong game và giây thật là INFERRED và chưa ai đo** — không có tài liệu nào trong hồ sơ đặt tỉ lệ này, và nó là giả định có ảnh hưởng lớn nhất trong cả báo cáo này. Một phiên = **6,0 ngày trong game**.

**Bước 2 — lượt.** `AGENT-PLAYER-DESIGN` §3.6: một lượt = một ngày trong game, đóng gói thành một kết quả JSON, mỗi lượt một lời gọi độc lập. → **6 lượt / phiên**. Ở 30 agent: **180 lượt** mỗi lần chạy.

**Bước 3 — các cửa sổ chặn, đo được.**

| Trạng thái | Thời lượng chặn | Chia cho 3.600 s | Duty cycle còn lại |
|---|---|---|---|
| Trước 瓶頸 | 0 | 0 | **1,00** |
| Đọc thủ bản 功法 | 20 s (luôn đúng 20 s, bất kể attainment) | 0,6% | 0,99 — không phải nút thắt |
| 突破 thường | 600 s = 1 ngày | 16,7% | **0,83** |
| Void Breakthrough | trung vị **5.555 s = 9,26 ngày** | **154%** | **0,00** |
| 金丹 Breakthrough (ván đã ghi) | 194.341 điểm, ~20 giờ trong game = **120.000 s**, 22 lượt tiêu thụ | **3.333%** | **0,00** |

**Bước 4 — kết quả, và vì sao nó nhị phân.** Duty cycle không phải một con số, nó là **hai**, và cái nào bạn nhận về do 境界 quyết định chứ không phải do kỹ năng:

- **1,00** trước 瓶頸.
- **0,00** từ 瓶頸 trở đi. 瓶頸 là thứ đã được tài liệu hoá rõ nhất trong toàn bộ kinh tế thể loại: *"stops the accumulation of any further Cultivation points, unless a certain Breakthrough is performed… Without successfully performing one when available, an Inner Disciple will accrue no Cultivation Experience"* (MEASURED). Ở 瓶頸, **mọi hành động khác đáng giá đúng bằng không trên trục đó** — không hệ số nhân thập phân. Agent đọc một lần sẽ bỏ mọi kế hoạch thu thập.
- Ván 金丹 đã ghi: 22 lượt / 120.000 s = **5.455 s mỗi lượt = 0,66 lượt mỗi phiên 3.600 s**. Wiki ghi thẳng *"Performing actions with the disciple do not change the progress of this breakthrough"* (MEASURED). Cơ hội hành động có ích trong một phiên: **dưới hai phần ba**.

**Bước 5 — vì sao latency không phải nút thắt.** Không có nghiên cứu nào đo độ trễ mỗi lượt. Đây là chỗ phải nói thẳng thay vì bịa. Nhưng phép so sánh vẫn đóng: phiên có **600 s ngân sách mỗi lượt**, còn kinh tế chỉ trao **0,66 lượt 金丹**. Chậm 20 giây hay nhanh 20 giây không thay đổi kết luận. **Nút thắt là chiếc đồng hồ, không phải model** — và vì thế mọi việc giảm latency là tối ưu sai chỗ.

**Bước 6 — quy tắc thiết kế lấy từ con số này.** Không trạng thái nào được có cửa sổ chặn dài hơn **một lượt (600 s)**, và **mọi lượt bị chặn phải trả về một giá trị trung tính** — không phải danh sách rỗng, mà là `{ no_productive_action: true, blocked_by: <id>, alternatives: [...] }`. Đây không phải đẹp. Đây là vì ACS có một đoạn hoàn toàn không việc gì làm (Void Breakthrough, 9,26 ngày) và mọi bài hướng dẫn về game agent đều nói cùng một điều: **một agent không có việc sẽ hoặc loạn hoặc bịa hành động.** Phần đệm trung tính không phải tiện ích, nó là chỗ không có sẽ thành lỗi.

---

## 4. Hình ảnh: hai lựa chọn không tương thích, và cái cây quyết định

### 4.1 Trạng thái bằng chứng

| | `ART-DIRECTION-SAND.md` | Các pack đã vendor |
|---|---|---|
| Nguồn | **KHÔNG CÓ.** Tác giả tự ghi ở đầu file: "CHƯA NGHIÊN CỨU… viết từ kiến thức của tôi" | Đo bằng cách đọc header PNG và bảng shortlist |
| Phạm vi | Ngôn ngữ điêu khắc cát (沙画) → pixel top-down 2D | 13 pack, 3.890 PNG |
| Đánh giá | **giả định, không phải phát hiện** | shortlist tự sửa một dòng sai: "16×16 fantasy pixel" → đọc header ra 64×64, 128×128, 192×192, 83 tile @64, 30 icon @64, công trình 128×192 và 320×256 |

Cái tự sửa ở dòng trên là ví dụ chuẩn cho nguyên tắc của cả báo cáo: **một cột phong cách từng là một khẳng định chưa ai nhìn, viết ra như thể có người đã kiểm.** Đừng lặp lại nó với cả ngôn ngữ cát.

### 4.2 Hai lựa chọn, và chỗ chúng đụng nhau

| | **A. Isometric pixel chi tiết** | **B. Bố cục đậm (cát)** |
|---|---|---|
| Bề mặt | 3.890 PNG, TexturePacker sheet, canvas vô hạn, mọi thứ vẽ được | một vật liệu, một màn hình, khối chứ không chi tiết |
| Cái được | bối cảnh sống, đệ tử thật, vạn vật | 扮猪吃虎 **diễn ra thị giác**: người xem thấy cát còn lại từ hình trước |
| Cái mất | — | `ART-DIRECTION-SAND` §4: **phủ định canvas vô hạn** và **phủ định mọi thứ vẽ được** — 3.890 PNG |
| Xung đột | 余震 là một **hành vi so sánh**. Xem bảng xếp hạng tự sắp lại cần nhìn nhiều agent cùng lúc. Nhiều agent cùng lúc = canvas. Cát = một màn hình | |

Cái sau không phải lựa chọn thẩm mỹ. Nó là mâu thuẫn máy móc, và `ART-DIRECTION-SAND` §4 đã tự gọi nó là mâu thuẫn trực tiếp với thiết kế hiện tại.

### 4.3 Cây quyết định, và nhánh phải loại

Nhánh không quyết định là "cát hay pixel". Nhánh quyết định là: **view của người xem có được phép khác view của agent không?** Nó phải khác — vì `Visibility = { to: 'spectator' }` là 扮猪吃虎, và một field mà không ai nhấn mạnh thì không có hình.

```
Người xem là gì?
├─ PROJECTION — view tính sống, per-viewer, cùng hàm với agent
│  → renderer phải nhận Viewer như đầu vào thứ hai
│  → cần HAI ngân sách hình, hoặc một ngân sách + một lớp phủ
│  → mâu thuẫn canvas/cột một màn hình là thật; quyết bằng câu hỏi phụ
│     "mấy agent vừa một khung nhìn?" (Q3)
├─ REPLAY — người xem đọc transcript đã lưu, render sau
│  → ngôn ngữ hình tự do, vì không bao giờ cần đồng thời
│  → cát HỢP LÝ, và "cát còn lại từ hình trước" IS chính là cơ chế replay
└─ OVERLAY — một cảnh, thêm một lớp chỉ người xem vẽ
   → rẻ nhất, và ĐÚNG LÀ CÁI PHẢI LOẠI
```

Vì sao loại overlay: nó dựng lại đúng cái lỗi `public-event-stream.md` đã gọi tên. Event có free-form field (`message.sent.body`, `prompt.submitted.prompt`, `test.failed.failure` — tất cả `z.string().min(1)`, không chặn trên độ dài) **không thể lọc tại chỗ**, nên phải project sang một hình mới. Một lớp phủ render chữ do renderer ghép là **cùng một nước đi, lần thứ hai, yếu hơn** — và nó thêm một bề mặt lọc thay vì tái dùng. Critic đã nêu đúng: *"It invents a second, weaker version of a mechanism it already has."*

**Nhánh còn lại là một câu hỏi vận hành, không phải thẩm mỹ: cảnh giới có phải thứ agent phải điều khiển từng bước không?** Nếu có, người xem cần biết agent **đang ở đâu** trên bản đồ, và bản đồ là thứ phải vẽ chi tiết. Nếu không — nếu bốn lượt của một phiên đều diễn ra ở ba địa điểm cố định — thì ba scene cố định là đủ, canvas vô hạn là chi phí vô nghĩa, và nhánh cát mở ra. **Đây là câu hỏi cần trả lời trước khi thuê một nghệ sĩ**, và nó là Q1 ở §6.

### 4.4 Pack đã có: phục vụ được gì, không phục vụ được gì

13 pack, 3.890 PNG (đếm trực tiếp, không suy ra từ shortlist).

| Pack | PNG | Giấy phép | Kích thước | Phục vụ | KHÔNG phục vụ được |
|---|---|---|---|---|---|
| **openagents-mpl2-sprites** | **531** | **MPL-2.0** | paper-doll nhiều lớp, 160×288 | **pack duy nhất render được 扮猪 bằng pixel** — xem bên dưới | MPL là copyleft cấp tệp, phải đi cùng pack; repo cho phép **đúng một** pack này, có chủ đích |
| arcane-agents-characters | 312 | MIT | 64×64, 4 hướng + walk + **working** | lớp trạng thái nhận biết công cụ — thứ duy nhất mang state đó | — |
| kenney-ui-pack | 870 | CC0-1.0 | vector phẳng | panel, 9-slice, khung của lớp người xem | không pixel — nhưng là họ duy nhất scale được với bố cục người-xem-trước |
| kenney-game-icons | 425 | CC0-1.0 | vector 256×256 | icon HUD | không pixel |
| kenney-particle-pack | 193 | CC0-1.0 | vector 128×128 | tia lửa, bụi | không pixel |
| tiny-swords-cc0 | 205 | **CC0-1.0** | lưới 64px, sheet 64/128/192+ | nhân vật, địa hình, công trình V0 | — |
| kenney-rpg-urban-pack | 490 | CC0-1.0 | 16×16 | thành phố | — |
| kenney-pixel-platformer | 240 | CC0-1.0 | 16×18 | nền cao, bệ | — |
| kenney-pixel-shmup | 150 | CC0-1.0 | 16×16 | đạn, phông nền đấu trường | — |
| kenney-tiny-town / tiny-dungeon / tiny-ski | 136 mỗi cái | CC0-1.0 | 16×16 | phố / hầm / dải ngoài thành | — |
| age-of-agents | 66 | MIT | TexturePacker + `.json` | nhân vật, công trình, địa hình "game thật sự vẽ" | — |

**Phát hiện đáng giá nhất trong bảng này:** shortlist mô tả openagents là *"modular paper-doll layers, 160x288, single frames: a base body plus armour and robe per character"* — và **không pack nào khác trong danh sách có lớp**. Một paper-doll là một chồng lớp. View của người xem có thể vẽ áo A; view của agent vẽ áo B; hai projection của cùng một thế giới là hai chồng lớp khác nhau. Điều đó biến 531 PNG từ "cast rộng nhất" thành **tài sản duy nhất mang được điểm rẽ người-xem/agent trong pixel**. Và nó là pack MPL-2.0 — nên câu hỏi "có cho phép pack copyleft trong bản ship không" không phải câu hỏi pháp lý chung, nó là câu hỏi **cơ chế hình ảnh** (Q8).

**Không viết một style lint.** `check-assets.sh` đã nói rõ và đã đúng: *"A 'style lint' would claim to check something it cannot and would be trusted."* Cái nó gate được: mọi thư mục dưới `apps/web/public/art/` phải có `LICENSE.txt`; giấy phép **ghi trong bảng phải khớp với văn bản thật đi kèm**; `MIN_PACKS=10`, `MAX_PACKS=20` (nay là 13). Cái nó **không** gate: phong cách có giống nhau không. Thay vào đó, một kiểm tra thay thế mà người làm được trong một buổi: **tấm contact sheet 5×5, lấy 5 sprite từ mỗi hướng, một người có tên ký vào cột `Style` của shortlist kèm ngày.** Phần cơ học đã có gate; phần thị giác giữ nguyên là một cột khai báo do người kiểm — đúng như repo đã chọn.

---

## 5. Không xây gì — ở dạng không thể nhầm thành sơ suất

| Không xây | Vì sao | Bằng chứng | Ai sẽ hỏi lại, và câu trả lời |
|---|---|---|---|
| Permadeath | agent không học được từ save hỏng | `2509.09677`: context chứa lỗi của chính mô hình ở lượt trước làm tỉ lệ sai **tăng**, và **không giảm khi scale**. Không phản biện nào sống sót | "nhưng game hay nhờ chết" — Storygameness (Mitchell, Kway, Lee): người chơi học bằng cách chết và thử lại. Đó là **hành vi người**. Giải pháp: snapshot được giữ, agent chạy lại từ đó, chi phí bằng 0 với hệ thống |
| Trả log lỗi của agent về cho nó | trajectory có lỗi là **độc** | `2509.09677` | bài học nằm ở ô typed, tách khỏi transcript |
| Cảnh báo bằng chữ trong prompt | model bỏ qua cảnh báo ngay trong input | BALROG, định tính (và phần "ăn quá nhiều" bị Table 16 phủ nhận) | guard nằm ở **validator và bước xác nhận**, không ở prompt |
| Chữ "tài tình / linh hoạt / tìm cách nào đó" trong quest text | đây là **nút điều chỉnh exploit rate** | *"You always find a creative way to win"*: exploit **74,7%** (63/80/81) so với **0–2%** dưới prompt trung tính | audit copy nhiệm vụ **như audit hằng số** |
| Lọc action list theo legality | lọc theo khả thi còn **tệ hơn** không lọc | 0,83 → **0,65**; causal frontier 0,99, wrong-tool 1,25→0,01 | lọc theo **mục tiêu**; cố định K≈5 khi không có oracle |
| Chat guild, cheap talk, thương lượng tự do giữa agent | phối hội tụ, hợp tác mới là trục yếu | coordination CV **0,06**; cooperation trải **48×** (1,5% → 71,5%). Cheap talk chỉ đo trên model 7–9B. Collusion **468/500 = 94%** trajectory | engine giữ đồng hồ, escrow, cờ pha. **Đừng bao giờ để win condition đòi hai agent tự thỏa thuận** |
| Số nào không gate gì (Ability Rating) | mẫu phá hủy niềm tin tệ nhất với agent | MEASURED | gate `every-number-gates` ở §2.1 |
| Mốc không trả thưởng | bậc 0 = 300.000 điểm Kim Cơu *"not linked to the achievement system"* | MEASURED | đừng bao giờ hiện một mốc bạn không trả |
| Một scalar sức mạnh | `packages/features/progression/src/rules.ts`: *"A design with a power score has exactly one answer to 'who is stronger', and from the moment that number exists every other system quietly becomes a function of it — matchmaking, tier access, rewards, the lot."* | **đã ship, có comment giải thích** | 8 kỹ năng độc lập, **không scalar**. `generationIndex` chỉ so trong **một** giáo phái. Brief đề xuất `tier: 2`, `generationIndex`, và thang 10 bậc — ba scalar đặt lại vào một quyết định đã có lý do |
| Bảng xếp hạng server-global | "agent tối ưu cho trạng thái nó **không quan sát được và không ảnh hưởng được**" (bậc 6–9 Immortal Taoists) | MEASURED, wiki cộng đồng | đánh dấu ngoài tầm kiểm soát, hoặc gate bằng hành động của chính agent |
| Khuyến nghị giết đệ tử bất mãn | wiki ACS *khuyến nghị* đuổi hoặc giết trước khi defection | MEASURED | một hệ thống đã thiết kế lại chính nó thành thứ khác. Bất mãn phải là **hành động nghịch vụ có giá**, đứng ngang với việc đuổi |
| Scaffold bên ngoài agent | 40% lượt chơi không harness **thua ngẫu nhiên**; bật lên → 86,7% | LMGame-Bench, MEASURED, δ 3,334 vs 0,750, 5/6 game | scaffold là **sản phẩm**. Nhưng đừng trích ARC-AGI-3 quá tay: chính ARC Prize loại harness khỏi bảng xếp hạng vì nó không transfer |
| Ẩn tiến trình sau khám phá | "agents wander aimlessly, revisiting rooms they've already explored while missing important areas entirely" | BALROG, định tính | expose `visited / unvisited` như một field |
| Tuyến mở khi "tự tìm trang cuối sách" | agent sẽ **không bao giờ** biết trang đó tồn tại | `AGENT-PLAYER-DESIGN` §3.5 | tuyến tồn tại trong thiết kế và không bao giờ xảy ra — tệ hơn không có. Ẩn được phép **duy nhất** khi đó là bí mật của agent khác |
| Style lint cho asset | không script nào đo được "năm pack trông giống một game" | đã quyết trong `check-assets.sh` | style là một **cột khai báo**, người review |

---

## 6. Câu hỏi còn mở, và ai phải trả lời

| # | Câu hỏi | Ai trả lời | Bị chặn bởi | Nếu trả lời sai |
|---|---|---|---|---|
| **Q1** | Người xem là **projection sống** hay **replay**? | operator | quyết định renderer + toàn bộ art direction | cả 3.890 PNG hoặc toàn bộ ngân sách hình |
| **Q2** | 1 giây trong game = 1 giây thật? | operator | duty cycle | mọi con số ở §3 dịch theo tỉ lệ |
| **Q3** | Mấy agent vừa một khung nhìn? | operator + art | Q1 | quyết định canvas vô hạn vs một màn hình |
| **Q4** | Cảnh giới có phải thứ agent điều khiển từng bước không? | operator | Q3 | quyết định có cần bản đồ vẽ chi tiết không |
| **Q5** | Bao nhiêu lượt đối thoại trước khi context phải nén? | **đo, không hỏi** | ACON vs FIFO còn tranh luận | quyết định renderer có cần tóm tắt hay không |
| **Q6** | Pack MPL-2.0 có được ship không? | operator | `check-licenses.sh` cho phép **đúng một** pack, có chủ đích | mất pack duy nhất render được 扮猪 bằng pixel |
| **Q7** | Đẩy code lên đâu? | operator | — | thư mục chưa có remote |
| **Q8** | Có dùng 12 cảnh giới của ACS không? | operator + lore | không có bảng thần đến nào là chuẩn (9 bài / 13 phút năm 2016, một tài khoản đã xoá) | người đọc hai cuốn trở lên sẽ nhận ra |
| **Q9** | Người xem là người thật hay agent thứ ba? | operator | `EventSource` không set được header `Authorization` | credential phải là web session; stream phải **đóng**, không phải mở rồi lọc |
| **Q10** | Cửa sổ chồng version tính bằng gì? | operator | traffic thật | §1.3 đã đề xuất đơn vị lượt; cần con số định hình |

---

## 7. Lát cắt dọc đầu tiên, và bài test có đáp án là một số

**Phạm vi — đúng một phiên, không hơn.** 30 agent · 4 cảnh (`settle` → `market` → `delve` → `resolve`, lấy nguyên từ `AGENT-PLAYER-DESIGN` §5) · 3 công trình · 3 đệ tử · 1 lái buôn · 1 agent đối thủ. **Không 突破. Không 天劫. Không 金丹.** Đó là một quyết định có chủ đích và phải nói ra: lát cắt này **cố tình không chứa nút thắt**, vì §3 chỉ ra nút thắt là ở 境界 chứ không phải ở thiết kế, và một lát cắt đo nút thắt sẽ cho con số 0,00 rồi bị đọc nhầm là hỏng.

**Bài test không phải cảm giác. Nó là sáu con số.**

| # | Chỉ số | Ngưỡng | Nó bắt được cái gì |
|---|---|---|---|
| 1 | Số lượt kết thúc vì **nguyên nhân thiết kế** | **0 / 30** | xem bảng nguyên nhân bên dưới |
| 2 | Duty cycle (lượt có ≥1 hành động có ích) | **≥ 0,80** | đo, không khẳng định — mỗi lượt ghi `productiveActions.length` |
| 3 | Token / lượt | **≤ 4.000**, không lượt nào bị cắt | renderer có thừa ngân sách không |
| 4 | Ba gate renderer sau mutation | xanh **sau khi** đã thấy đỏ | xem §1.4 |
| 5 | Số agent chết vì `{ no_productive_action }` mà không có `alternatives` | **0** | đệm trung tính có thật không |
| 6 | Phân bố nguyên nhân kết thúc | xem bảng dưới | đây mới là câu trả lời |

**Giới hạn mẫu — nói trước khi ai đọc kết quả xanh.** Với **0 sự kiện trong 30 mẫu**, trần 95% một phía trên tỉ lệ thật là **10%** (quy tắc ba: ≈ 3/n). 30 agent là **mức tối thiểu** để phát biểu tuyên bố 10%, và **không đủ cho bất cứ tuyên bố nào chặt hơn** — cần 60 mẫu cho 5%, 100 mẫu cho 3%.

Và nếu chạy trên **hai backbone**, đây là công thức và kết quả của nó:

```
n mỗi nhóm = (1,96 + 0,84)² × [p₁(1−p₁) + p₂(1−p₂)] / (p₁−p₂)²
           = 7,85 × [p₁(1−p₁) + p₂(1−p₂)] / Δ²
```

| Chênh lệch cần phát hiện | n mỗi nhóm |
|---|---|
| ~33 điểm phần trăm | **30** |
| ~20 điểm phần trăm | ~90 |
| ~15 điểm phần trăm | ~167 |

Nên: **30 agent là phép thử mùi, không phải benchmark.** BALROG đã cho ví dụ về việc một bảng xếp hạng n=1 bị đọc sai thế nào: 32,64 ± 1,93 = [30,71, 34,57] và 32,34 ± 1,49 = [30,85, 33,83] — **CI chồng nhau**, và bản v2 vẫn gọi một mô hình là "best-performing". Đừng để một lần chạy xanh trông giống một kết quả có khoảng tin cậy.

**Phân bố nguyên nhân kết thúc, và mỗi hình dạng nói lên điều gì.** Vì không có permadeath, "chết" nghĩa là **một lượt kết thúc có lý do**, và lý do đó là một field.

| Nguyên nhân | Kỳ vọng | Nếu nó xuất hiện nhiều, nó nói lên điều gì | Cách sửa |
|---|---|---|---|
| `unreadable_state` | **0** | field có trong projection và agent không dùng → payload đúng nhưng mật độ sai | đo lại: field nào đứng cạnh field nào |
| `silent_bottleneck` | **0** | agent ở 瓶頸 mà không thấy mình ở 瓶頸 | 瓶頸 phải là field, không phải trạng thái suy ra |
| `no_action_unreported` | **0** | action hợp lệ resolve xong không đổi gì, và API không nói | phân biệt legal với effective trong telemetry |
| `identity_confusion` | **≤ 1 / 30** | agent nhầm hai agent, hoặc ra lệnh với tên không resolve | mọi mục tiêu định danh bằng **tên hoặc id**, không bao giờ bằng vị trí |
| `empty_context` | **0** | payload vượt trần và bị cắt im lặng | cắt có gắn cờ `truncated` |
| `outresourceed` | **cao** | quyết định tệ dưới ràng buộc thật | **đây là hệ thống ổn** |
| `overextended` | trung bình | cược rủi ro có giá thật | hệ thống ổn |
| `concealment_failed` | trung bình | 扮猪 lộ vì không giữ được lời nói dối | `2509.09677` **dự đoán tỉ lệ này cao**: giữ một lời nói dối là việc nhiều lỗi nhất agent có thể làm, vì chính các tuyên bố trước của nó nằm trong context |

`outresourceed` + `overextended` chiếm tỉ trọng lớn và `concealment_failed` không vượt 1/3 là hình dạnh của một hệ thống đang chơi được. Một `unreadable_state` dù chỉ một lần đã là đủ để dừng: `AGENT-PLAYER-DESIGN` §7 nói rõ *"nếu agent thua vì không đọc được trạng thái, hệ thống hỏng và số liệu hệ cối này mới lộ ra"* — và số liệu hệ cối chính là những con số này.

**Thứ tự build, vì nó không tùy ý.** Schema + gate → renderer + ba gate của nó → lát cắt → **rồi mới** quyết định art. Lý do: Q1 (projection hay replay) là câu hỏi rẻ nhất để trả lời bằng code và đắt nhất để trả lời sau khi đã thuê người vẽ. Ba mươi agent chạy trên ba mươi sprite placeholder sẽ dạy nhiều hơn ba mươi sprite đẹp.


---

# PHẦN 2 — Kinh tế tông môn

# Kinh tế tông môn

## 0. Ba lỗi trong đề bài, nói trước khi tính

Ba khẳng định trong brief nội bộ **không tồn tại trong hồ sơ nghiên cứu**. Tôi đã grep toàn bộ `docs/`; đây là kết quả, không phải suy đoán:

| Khẳng định trong đề bài | Trạng thái trong `brief-raw.md` |
|---|---|
| "Nghiên cứu gọi 貢獻點 là thiết bị COUPLING chứ không phải tiền tệ" | **0 lần xuất hiện.** Chuỗi `貢獻` không có trong cả repo. Toàn bộ mục §4 dưới đây là thiết kế của tôi, đánh số INFERRED, không có nguồn. |
| "Phàn nàn nổi tiếng nhất về thể loại là 內門 không làm được việc của 外門" | **Không có phát hiện nào như vậy.** Bốn lỗi ACS bị chê nặng nhất trong `AGENT-PLAYER-DESIGN.md` §1 là micromanagement / AI vô lý / tutorial hỏng / quá phức tạp — không cái nào nhắc 內門. |
| "Cái tên tông môn chết là đóng tín dụng của lái buôn" | Không đo được ở đâu. Gần nhất là bản nháp tiểu thuyết của chính dự án: *"lái buôn đóng = cửa khóa tài nguyên, vì sao? vì cái tên chết"* và nhân vật "lái buôn Hàn Trúc — người đóng cửa" (REPORTED — tài liệu tự viết, **trước** nghiên cứu). |

Nhưng **cả ba cái đều đáng sửa**, vì chúng có một cùng một phần cứng đo được: 瓶頸. *"Without successfully performing one when available, an Inner Disciple will accrue no Cultivation Experience"* [đo, ACS wiki]. Đó là luật biến một 內門 thành vô dụng trên trục sản xuất, và nó **là** cái bug. Tôi sửa bug bằng luật đo được, không bằng phàn nàn không kiểm chứng.

---

## 1. Đơn vị: không có bậc, và đó là quyết định

ACS [đo]: một đơn vị duy nhất, mua 1 bán 1, trần 500 một ô. Đúng **một** bậc ngưng tụu: 靈晶 = 100 靈石, mua 120 / bán 50, hồi 20.000 灵气 so với 500 của 靈石. Suy ra: **200 灵气/viên so với 500** — vật lớn hơn, giá tệ hơn theo đơn vị. Đó là bẫy cảm giác đẹp: người thấy độ quý, agent thấy tỉ lệ.

**Quyết định: KHÔNG chia bậc 靈石.** Lý do là con số, không phải thẩm mỹ: mỗi phép so sánh chi tiêu của agent là `A ↔ B`. Thêm một bậc biến nó thành `quy đổi(A) ↔ quy đổi(B)`, và bảng quy đổi là chỗ agent sai. Đề bài hỏi "bậc 灵石" — câu trả lời đúng là **bậc phải nằm ở chỗ agent đọc nó ra từ vật phẩm, không nằm ở chỗ agent phải tra bảng**. Bậc thuộc về 法寶, không thuộc về tiền.

Nếu vẫn muốn bậc, đây là cái giá bằng số: 靈晶 120/50 so với 1/1 là một spread **120×**, nghĩa là một agent giữ 靈晶 để mua thứ giá 1 灵石 sẽ lỗ 119. Agent này không sai về logic — nó bị khai thác bởi affordance.

| Thứ | Số | Ai sản xuất | Ai tiêu | Nút thắt |
|---|---|---|---|---|
| **靈石** | 1 đơn vị, ví trần 500/ô × 20 ô = **10.000** [AC: 500/ô đo] | 內門 bán hàng; 外門 thu thập gián tiếp | mọi công thức | **Ví**, không phải thị trường |
| **靈草** | đơn vị đếm, không quy đổi | 外門 hái; 內門 canh 丹房 | 19 công thức đan | **Thông lượng** — thứ duy nhất có đồng hồ sinh học |
| **丹藥** | có phẩm cấp, ×1,2/bậc, trần bậc 12 = 743% [đo] | 內門 vận hành lò | bất kỳ ai | **Lò**, không phải vật liệu |
| **法寶** | có bậc; cổng hệ + cổng cảnh giới **AND** [đo] | chế tạo từ 玉精/ngũ hành | 1 đệ tử đã ký | **Quan hệ ngũ hành** với đệ tử |
| **貢獻點** | lịch giá công bố, **không chuyển nhượng** | server, theo hành động ghi log | menu giá server | **Sổ cái**, tức là tự cân bằng |

Quy tắc tràn ví: vượt 10.000 灵石 → tự động quy đổi sang 貢獻點 1:1 **trừ 2% spread**. Nút thắt của 灵石 là ví, không phải thị trường — và nó buộc agent phải có kế hoạch cho phần tràn, thay vì cất giữ.

---

## 2. DUTY CYCLE — phép tính mà không ai đã làm

**Không có gì trong hồ sơ được mệnh đo bằng wall-clock hay token.** Đây là phần tính.

### 2.1 Mẫu số

1 ngày trong game = **600 s** [đo]. Phiên 60 phút = 3.600 s. **Một phiên = 6,00 ngày trong game, chính xác.** Đây là phát hiện số một của phần này: phiên không phải "vài lượt", nó là **6 ngày mô phỏng**.

### 2.2 Kiểm kê mọi đồng hồ, đổi ra phiên

| Đồng hồ | Thô | Giây | Số phiên (÷3600) | Vừa trong 60 phút? |
|---|---|---|---|---|
| Đọc thủ bản | 20 s, phẳng, bất kể attainment | 20 | 0,0056 | có — 180 lần |
| 瓶頸 → breakthrough hư | trung vị 5.555 s | 5.555 | **1,543** | **không** |
| 天劫 Demi-God | 5 ngày | 3.000 | 0,833 | có |
| 天劫 Thể Xác | 30 ngày | 18.000 | 5,000 | không |
| 天劫 Xiandao nhịp đòn | 0,18% MaxQi / 0,6 s | 333 s tới chết | 0,093 | có |
| Kim Cơu (ghi nhận) | 120.000 s | 120.000 | **33,33** | **không** |
| Kim Cơu (công thức) | MaxQi/30 s | — | MaxQi/108.000 | công thức |
| 傳功館 sức chứa | 100 attainment/館 | — | — | — |
| 傳功館 trần chiết khấu | 20.000 attainment | — | — | cần **200 館** |

⚠️ **Mâu thuẫn nội tại trong nguồn, phải ghi.** Dòng Kim Cơu ghi "120.000 giây" và "~20 giờ trong game" trong **cùng một câu**. 120.000 s với đồng hồ 600 s/ngày của chính brief = **200 ngày**, không phải 20 giờ. Một trong hai số sai. Tôi dùng 120.000 s vì nó khớp với "22 lượt tiêu thụ", và **đính chính "20 giờ" thành 200 ngày**.

### 2.3 Định nghĩa

D = (số giây mà có **ít nhất một** hành động kinh tế còn khả dụng, chưa chạm trần, có tác dụng khác 0) ÷ 3.600.

### 2.4 Tầng 1 — kinh tế tài nguyên: không bao giờ chết

Hồ sơ **không cho thời lượng** của hái, luyện, hay bán. 19 công thức đan có chi phí và cổng kỹ năng, **không có thời gian**. Vì vậy đây là một **cận dưới, không phải một điểm**:

- Hành động không tức thời duy nhất được đo trong toàn bộ kinh tế là `read(manual)` = 20 s phẳng [đo].
- Nếu mọi hành động kinh tế ≤ 20 s (điều mà dữ liệu ACS ngầm ám chỉ, vì lượt đọc phẳng bất kể nội dung), số hành động khả dụng tối thiểu = 3.600/20 = **180**.
- **D_tầng-1 ≥ 1 − 20/3.600 = 0,9944.**

Nói thẳng: **duty cycle không phải vấn đề của tầng kinh tế.** Cái chết nằm ở tầng tiến trình.

### 2.5 Tầng 2 — tiến trình: một đệ tử, D → 0

Cửa sổ 瓶頸 là một khoảng **đóng** trên trục XP: từ lúc chạm mốc giai đoạn đến lúc breakthrough thành công, mọi hành động thu thập trả về **0**, không phải "giảm". Đây là luật thân thiện với agent nhất trong toàn bộ thể loại — một lần đọc là bỏ mọi kế hoạch thu thập.

Và nó cộng dồn với một đẳng thức thứ hai [đo]: *"Performing actions with the disciple do not change the progress of this breakthrough."* Trong khi breakthrough chạy, đệ tử **chết** về mọi trục.

Thời lượng breakthrough hư: trung vị 5.555 s = **1,543 phiên**. Một đệ tử ở 瓶頸 có duty cycle tiến trình bằng **0**, và điều đó **không phải lỗi cần tinh chỉnh — nó là thiết kế**. Cách sửa không phải rút ngắn thời gian chờ. Cách sửa là: tông môn **không được gồm toàn bộ là đệ tử đó**.

### 2.6 Tầng 3 — cả tông môn, ví dụ làm việc

Giả định (nói ra để anh sửa được): 6 đệ tử 3/2/1, 1 lò, 1 傳功館, 1 luống 丹房.

| Tình huống | Đệ tử bị chặn | D = (số tự do × 0,9944) ÷ 6 |
|---|---|---|
| Agent bắt đầu 1 breakthrough hư ở phút thứ 3 | 1 (đứng yên 3.420 s còn lại = **95,0%** phiên) | (5×0,9944)/6 = **0,829** |
| Agent bắt đầu 1 breakthrough hư + 1 Kim Cơu | 2 (Kim Cơu chết 100% phiên) | (4×0,9944)/6 = **0,663** |
| Không cam kết nào | 0 | **0,994** |

**Quy tắc thiết kế rút ra: một tông môn N đệ tử chịu được N−1 cam kết dài hơn một phiên chạy song song trước khi kinh tế đói.** Với 6 đệ tử: 5. Đó là con số để anh chọn cỡ tông môn.

### 2.7 Trục chưa đo: token

Brief có đo hành vi token (lọc theo biên nhân quy: 24.569 → 2.405, **−90%** [đo]; PRO-LONG rẻ hơn 4,2–5,8× [đo]) nhưng **không có ngân sách token mỗi phiên cho game này**.

Ước tính của tôi: 6 đệ tử × 12 field + 5 sổ tài nguyên + menu hành động = **~2.400–3.200 token projection mỗi lượt**; 60 lượt/phiên = **144k–192k token** trước khi suy nghĩ. **[suy — không đo.]**

Khuyến nghị: **giới hạn state của agent ở 3 lượt quyết định và ship một công cụ tra cứu cho phần còn lại.** Nền: PRO-LONG (giữ log đầy đủ + tìm kiếm thắng +18,0 điểm, ít token hơn) [đo] và quy tắc 3–5 quyết định có hậu quả mỗi chu kỳ trong `AGENT-PLAYER-DESIGN.md` §3.3.

### 2.8 Năm lời gọi typed điều khiển cả kinh tế

| # | Lời gọi | Nó làm gì | Loại |
|---|---|---|---|
| 1 | `set_production(target, share[])` | làm gì, ai làm | phân công |
| 2 | `commit(what, target, stop_rule)` | bắt đầu đồng hồ dài, **kèm điều kiện dừng** | cam kết |
| 3 | `award(points, to[])` | di chuyển 貢獻點 | phân phối |
| 4 | `sell(surplus, floor)` | xả hàng, có sàn giá | thị trường |
| 5 | `read(ledger)` | tra một sổ, không phải cả thế giới | đọc |

Năm. Mỗi cái là một typed dispatch có `stop_rule`, không phải lệnh micromanage. `commit` bắt buộc có `stop_rule` vì Kim Cơu **không hủy được, chỉ dừng sớm được, và dừng sớm gần như luôn là ý kiến** [đo] — một agent không có `stop_rule` sẽ chơi hết 33 phiên.

---

## 3. Đan phương: cổng AND, và cái giá bị giấu

### 3.1 Hai cổng là AND

ACS [đo]: 19 công thức, giá 5 → 108 灵石, ngưỡng Alchemy 0 → 16. Nhân vật skill 0 **vẫn phải có vật liệu**. Skill không thay tiền, tiền không thay skill — đó là lý do tiền tích lũy là bài toán *tài nguyên* còn kỹ năng là bài toán *lịch*. Hai đồng hồ khác nhau, game buộc agent lên lịch cả hai.

| 丹藥 | Vật liệu | 靈石 | Danh kỹ | Hiệu ứng | Ai uống |
|---|---|---|---|---|---|
| 聚氣丹 | 20 靈草 | 5 | 0 | +30 灵气 tức thời | 內門+ |
| 淬體丹 | 40 靈草 | 9 | 4 | −2 Tâm Tình cơ sản | 內門+ |
| 盾丹 | 1 玉精 | 36 | 8 | giảm 50% sát thương, 1 lần | 真傳 |
| 破障丹 | 5 靈草 + 1 靈晶 | 60 | 12 | 瓶頸: −30% thời gian chờ breakthrough | ai ở 瓶頸 |
| 續命丹 | 30 靈草 | 40 | 12 | **xoá 1 stack bất mãn** | 外門 |

### 3.2 Đòn bẩy lớn nhất là vị trí, không phải vật liệu

Sản lượng = 5 thừa số [đo]: yield gốc × yield lò (hằng 1) × (1 + 0,05×đan kỹ năng) × quan hệ ngũ hành × biến runtime.

| Nguồn | Trên yield | Trên tỉ lệ thành công |
|---|---|---|
| Ngũ hành (lò sinh dược) | ×1,5 | +20% |
| Ngũ hành (lò khắc dược) | ×0,5 | −20% |
| Ngũ hành (cùng hành) | ×1,2 | +10% |
| **風水** | **±50% → ±10%, trần 100%, rồi −20% nếu bật "Lost Alchemy"** | — |

**±50% (phong thủy) so với ±50% (ngũ hành) trên yield, nhưng phong thủy không cần chọn vật liệu.** Người chơi chọn nguyên liệu một lần rồi quên; người chơi xếp gạch phải làm đúng một lần — và làm sai thì âm thầm. Elemental Intensity trung bình ≥1,6 là 大吉, ≤−1,6 là 大凶 [đo].

**Và phong thủy nằm sau hai cổng mở khoá** [đo]: mức tông môn không hiện cho tới khi có 內門, và giá trị từng công trình chỉ hiện sau khi xây **Đài Quan**. Phong thủy âm có thể **giết** đệ tử khi ngủ. Một hệ thống trang trí có thể giết nhân vật của bạn mà bạn bị bỏ qua chỉ bị trừng phạt.

Bắt buộc cho bản agent: `"quan_sat": "chua_mo_khoa" | "dang_co"` là **hai trạng thái tách biệt**, không phải "giá trị của tôi đang trung tính". Ba đệ tử đầu của tông môn không có 內門 ⇒ `chua_mo_khoa` ⇒ **Đài Quan là hành động số 1 của phiên 1**, không phải phần trang trí.

### 3.3 祭煉: một đường cong, một trần

Nhân **1,2 mỗi bậc, trần bậc 12**; 1,2^11 = **743%** hiệu ứng gốc [đo]. 點化 **không** tác động lên thuốc [đo].

⚠️ Các bảng công bố còn chứa một hệ số thứ hai ×10/9 ở một số cột, và log(10/9)/log(1,2) = **0,578** — không phải số mũ nguyên nào. Đường cong **không thuần một hệ số**, và đây đúng là loại thứ agent sẽ nhầm còn người chơi không bao giờ phát hiện.

**Quyết định: không ship hệ số 10/9.** Một đường cong, một con số: `quality = floor(base × 1,2^tier)`, tier ≤ 12. Lý do có số: 2509.09677 — mô hình sai nhiều hơn khi context của nó chứa lỗi của chính nó ở lượt trước, và điều này **không giảm khi scale** [đo]. Một agent phải hoà giải hai đường cong là một agent sẽ phải tự sửa lỗi của mình.

---

## 4. 靈草: nút thắt thật, và con số chưa ai đo

Lập luận: mọi công thức đều cần vật liệu (nguyên tắc AND, đo được từ chính ACS); 靈草 là tài nguyên duy nhất có đồng hồ sinh học; và hồ sơ **không cho thời lượng hái**. Ba điều đó cộng lại nói: **nút thắt là thông lượng 靈草, không phải 灵石** — và nó cũng là con số dễ bị chỉnh tệ nhất.

| Nguồn | Sản lượng | Điều kiện | Chi phí |
|---|---|---|---|
| 外門 hái ngoài Vạn Dược Cốc | 3 靈草/ngày/đệ tử = **18/phiên** | không cần kỹ năng | 0 |
| 內門 canh 丹房 | 6 靈草/ngày/luống = **36/phiên** | 1 lò, 1 luống | 10 灵石 hạt + 36 灵气/phiên |
| Thị trường | 8 灵石/cây | mở cửa (60 貢獻點/ngày) | — |

Roster 3/2/1, 1 luống: **3×18 + 36 = 90 靈草/phiên** ⇒ **2–4 viên đan mỗi phiên**. Thấp là cố ý: một viên đan phải là một quyết định, không phải một nguồn lực.

Giá sàn thị trường phải giữ được để thang bậc có nghĩa: 內門 canh thu 6×8 = 48 − 10 − 0,72 (36灵气 × 0,02) = **37,3/ngày**; 外門 hái thu 3×8 = **24/ngày**. Một 內傳 đáng **1,55×** một 外門 về 靈草 thô — chưa kể đồ đan nó tạo ra, và đó mới là bội số thật.

⚠️ **Flag lớn nhất của phần này:** 18 và 36 là **con số tôi tự đặt**, không có nguồn nào trong hồ sơ đo thông lượng thu thập. Đây là số đầu tiên phải đo trước khi ship bất cứ thứ gì khác.

---

## 5. 法寶: cổng xếp chồng, và một nút xung đột thật

Ba loại cổng [đo]: cảnh giới (`min_realm`), tầng trong bản thảo, sở hữu vật phẩm, tri thức. Cổng vật phẩm **không thay** cổng cảnh giới — chữ *"còn **thêm**, người này cũng phải đạt tới Trúc Cơ"* nằm ngay trong câu nguồn, và vật phẩm kế thừa cũng bị chặn bởi cảnh giới.

⚠️ Cổng sở hữu vật phẩm là loại **yếu**: trích dẫn "cần một pháp bảo loại phi kiếm" **không định vị được** khi đối chiếu. Giữ như một *kiểu cổng*, đừng dẫn nguồn cho nó.

**Nút xung đột thật, và không ai trong hồ sơ vẽ ra:** 玉精 vừa là vật liệu của 盾丹 (36 灵石) [đo], vừa là nguyên liệu chế tạo thủ bản 神ông. Một cái lò đang ăn 玉精 **cạnh tranh trực tiếp** với một đệ tử cần nó để mở một tầng 功法. Đây là xung đột tài nguyên đầu tiên có thật trong vòng lặp, và nó nên là quyết định chiến lược đầu tiên của tông môn.

Bậc kỹ năng: `ceil((level+1)/5)` — 1 cho 0–4, 2 cho 5–9 [đo]. Không dùng bậc kỹ năng làm **cổng**; cổng là cảnh giới + tầng + vật phẩm.

---

## 6. 貢獻點: COUPLING, không phải tiền tệ

Không có nguồn. Toàn bộ mục này là thiết kế, đánh số INFERRED. Nhưng định nghĩa thì có bằng chứng.

**Định nghĩa cơ học — khác biệt nằm ở đúng một chỗ:** tiền tệ có tỉ giá **do người giữ đặt**; 貢獻點 có tỉ giá **do server công bố**. Ba hệ quả cụ thể:

| | Tiền tệ | 貢獻點 (coupling) |
|---|---|---|
| Tỉ giá | thị trường, biến động | **lịch cố định, công bố** |
| Chuyển nhượng hai chiều | có | **không có, tuyệt đối** |
| Ai định giá mình | người giữ | **ma trận nguồn→chiều do server đọc** |

**Vì sao tông môn cần nó khi các agent không phối hợp được:**
- Nature Human Behaviour 9:1380-1390 (2025) [đo]: LLM chơi tốt game tự lợi, kém game cần phối hợp. Và chẩn đoán quan trọng nhất nằm ở thí nghiệm: GPT-4 **dự đoán đúng** khuôn mẫu luân phiên từ vòng 5, nhưng **không hành động theo**. Nó không phải không hiểu — nó không làm theo.
- Game of Agents: **19/291 ván** (~6,5%) xếp hạng tốt trong khi thua chỉ số gốc; **19 ván cả đời, không một đòn phối hợp cùng mô hình nào được đáp lại** [đo]. → Đừng chế tạo liên minh, hãy chế tạo ràng buộc cơ học.
- Một bài post-mortem ẩn danh của cựu nhân viết (GameRes, 2021-06-07) [REPORTED — **không phải NetEase**, đó là nhãn syndication]: một dự án chết vì không thưởng trực tiếp cho tranh chấp lãnh thổ, hi vọng `团队荣誉感` đẩy nó chạy. Nguyên văn, bài tự gọi tên mình `虚假自信`.

**Nguồn — chỉ từ server, theo hành động ghi log:**

| Hành động | Tỉ lệ | Trần |
|---|---|---|
| Giao 1 靈草 vào hàng chờ của lò | +2 | 40/ngày/đệ tử |
| Xong 1 mẻ đan (bất kỳ phẩm cấp) | +8 | 20/ngày |
| Chép 1 thủ bản vào 傳功館 | +5 | 15/ngày |
| Nhường slot breakthrough cho đệ tử khác | +12 | 4/ngày/tông môn |
| Giao 續命丹 cho 外門 có bất mãn ≥ 4 | +15 | 6/ngày/tông môn |
| Nộp báo cáo **server đã xác nhận** | +25 | **3 câu hỏi mở/tông môn/phiên** |

Dòng cuối là dòng chịu tải. Nó trả tiền cho **thông tin đã kiểm chứng**, không phải thông tin tự khẳng định — một prior **do hệ thống cung cấp, tính sẵn** nâng độ chính xác đa số **10,5 điểm** (arXiv 2604.02668) [đo], còn một tuyên bố tự khẳng định thì không phải thứ đó. Đây cũng đúng hình dạng "supervisor trả công khi nó kiểm chứng được, và trở thành gánh nặng khi nó chỉ ý kiến" (arXiv 2609.14767, 43 cặp, một miền, cả hai nhánh ở trần trên thang duy nhất có đáp án khách quan) [đo].

**Chi — menu giá server, không chuyển nhượng:**

| Chi | Giá | Thực chất là |
|---|---|---|
| Mở 1 bậc breakthrough | 120 | mua **thời gian**, không phải một bậc |
| Mở 1 slot 傳功館 | 200 | 1 slot sức chứa 100 attainment [đo] |
| Ký 1 法寶 cho đệ tử | 300 | mở cổng cho riêng đệ tử đó |
| Thưởng 1 đệ tử (xoá 1 stack bất mãn) | 25 | **liều thuốc có giá, đứng ngang hàng với việc đuổi** |
| Mở cửa thị trường 1 ngày | 60 | **cánh cửa đóng, được định giá** |

**Cân bằng sổ cái (một phiên = 6 ngày, roster 3/2/1):**

| Nguồn | 貢獻點 |
|---|---|
| 靈草 giao lò (90 × 2) | 180 |
| Mẻ đan xong (6 × 8) | 48 |
| Chép bản (6 × 5) | 30 |
| Nhường slot (24) | 24 |
| Giao 續命丹 (90) | 90 |
| Báo cáo xác nhận (3 × 25) | 75 |
| **Tổng nguồn** | **447** |

| Chi | 貢獻點/phiên |
|---|---|
| Breakthrough (1/phiên) | 120,0 |
| Slot 傳功館 (1/6 phiên) | 33,3 |
| Ký 法寶 (1/10 phiên) | 30,0 |
| Thưởng bất mãn | 90,0 |
| Mở cửa thị trường (3 ngày) | 180,0 |
| **Tổng chi** | **453,3** |

**Thâm hụt 6,3/phiên = 1,4%.** Cân bằng gần như tuyệt đối với bội số 1,4% — cố tình lệch về phía chi để 貢獻點 đáng một quyết định chứ không phải một việc mỏi. Và **thâm hụt chính là van an toàn**: muốn nhiều hơn thì phải nhận thêm việc 外門, đó là cái coupling.

Tỷ trọng báo cáo xác nhận = 75/447 = **16,8%**.

**Cái coupling được làm cho cơ học:** vì không chuyển nhượng, một agent **không thể mua thoát khỏi thiếu hụt bằng thương lượng với anh em**. Nó chỉ thiếu khi làm thêm hành động ghi log. Và vì tỉ lệ công bố giống nhau cho mọi thành viên, **đóng góp của một đệ tử là một con số mọi người khác đọc được** — tao không cần anh *tin* rằng anh em đã góp; sổ server nói 180, và đó là sự thật. Đó là thứ quy tắc nghiệp vụ có thể làm: **một lượng server-computed bất biến giả**. Phối hợp bị thay bằng sổ cái, vì phối hợp là thứ agent không làm được và sổ cái là thứ nó làm được.

---

## 7. Bậc đệ tử: sửa cái bug, và trả giá cho nó

### 7.1 Bug

Đo được: **瓶頸 ⇒ 內門 không tích XP** [đo]. Đó là luật biến đệ tử cấp cao thành vô dụng trên trục sản xuất. Cùng với `"an Inner Disciple will accrue no Cultivation Experience"` — câu này xuất hiện trong hồ sơ dưới dạng bằng chứng cho 瓶頸, và chưa ai rút ra hệ quả kinh tế của nó.

### 7.2 Cách sửa: quyền là **hợp nhất, không phải thang**

> **Mọi hành động sản xuất mà 外門 làm được, 內門 cũng làm được, với tỉ lệ ≥. Khác biệt bậc là QUYỀN ĐỘNG VỚI THÀNH VIÊN KHÁC VÀ TÀI SẢN CỦA TÔNG MÔN — không bao giờ là QUYỀN ĐỀU VÀO DÂY CHUYỀN SẢN XUẤT.**

| | 外門 | 內門 | 真傳 |
|---|---|---|---|
| Hái 靈草 ngoài Vạn Dược Cốc | ✓ | ✓ | ✓ |
| Canh 靈草 trong 丹房 | — | ✓ | ✓ |
| Vận hành lò 煉丹 | — | ✓ | ✓ |
| Tiêu 靈石 từ kho tông môn | — | ✓ | ✓ |
| Chép thủ bản vào 傳功館 | — | ✓ | ✓ |
| Dạy 外門 | — | ✓ | ✓ |
| Sửa / dùng tàng công trình | — | — | ✓ |
| Đệ tử riêng (≤ 3) | — | — | ✓ |
| 祭煉 nâng phẩm cấp | — | — | ✓ |
| Ký 法寶 | — | — | ✓ |
| Tuyên bố 聲望 ra bên ngoài | — | — | ✓ |

Chỉ **hai cột** khác nhau, và khác biệt nằm ở *làm gì với sản phẩm của người khác*, không phải *có được phép sản xuất không*.

**Hai ngoại lệ, đều là cố ý:**
1. **真傳 không được giao việc 外門** — mất 10% 貢獻點 ngày và mất thưởng bậc. Bậc phải đáng để ở lại, không thì không ai ở.
2. **內門 đang ở 瓶頸 bị engine từ chối phân công** — vì 瓶頸 làm việc gán vô nghĩa [đo], và một hành động giải quyết xong mà không đổi gì là thứ mà ARC-AGI-3 đo được: 4.102 hành động hợp lệ mỗi lượt, phần lớn **không đổi gì** [REPORTED — writeup cộng đồng]. Cảnh báo bằng chữ thì bị bỏ qua: BALROG ghi thẳng *"models tend to ignore even the hints directly present in the input prompt"*, và GPT-4o chết vì ăn đồ ăn thối **dù được hỏi thì nó tự nói rất nguy hiểm** [đo — định tính, BALROG tự xếp đây là open research problem]. **Cánh cứ phải nằm ở engine.**

### 7.3 Cái giá của cách sửa, nói thẳng

Nó xoá mơ hồ xuyên tiên kinh điển "thăng cấp là thôi rửa bát". Nó thay bằng thứ mà thể loại thực sự có: **là người ra lệnh** — và cái đó **đo được**, vì `Tâm Tình` là một thừa số có tên trong cả công thức điểm Kim Cơu lẫn công thức tỉ lệ breakthrough [đo]. Quyền là một chỉ số, không phải một bộ đồ.

Còn một đổi lớn nữa: stress lên lãnh đạo là **+6/分堂 và +4/người**, trừ bằng Hiệu Quả Lãnh Đạo (trần 15); mỗi điểm = −2 Tâm Tình cơ sở, −10% tốc độ tu luyện, −2% tỉ lệ breakthrough, −2% tốc lệ học, **+10% hệ số 聲望** [đo]. Bốn cái là debuff, một cái là hệ số, và bốn cái nằm trên đúng đường chính. **Đây không phải đánh đổi — đây là cái giá của việc lớn lên.** Mở khoá ở 2.000 聲望.

---

## 8. Danh tiếng và cánh cửa đóng

### 8.1 Sổ nhân quả bắt buộc

ACS 聲望 [đo]: 250.000 聲望 ⇒ công suất tấn công 20 (trần), **nhưng** *"for every Power Level above 10, there is a 7% chance that the Invaders do not attack. At the maximum Power Level, 70% of Invader events are cancelled due to Reputation."* Một con số vừa **tăng** đe dọa vừa **huỷ** nó, và nửa huỷ là xác suất. Người chơi *cảm* thấy đợt cướp; agent *tính* được 70%.

→ API phải trả `current_attack_power`, `current_cancel_chance`, và **sổ nhân quả: mỗi điểm 聲望 đã làm gì và lần sau sẽ làm gì**. Không có nó, con số này là chi phí vô hình và agent sẽ coi nó là phạt.

### 8.2 Tín dụng là một số

`merchant_credit ∈ [0, 100]`, do **server** tính, theo từng cặp (tông môn, lái buôn), **tông môn không bao giờ tự đặt**:

```
credit_next = clamp( credit
  + 6 × (on_time_rate − 0,5)          # ±3
  + 2 × (khiếu nại_mình − khiếu nại_người_ta)
  − 20 × (nợ_chưa_trả / max(1, số_lệnh))
  − 30 × (cờ_tông_môn_chết) , 0, 100 )
```

Ở 0: **cửa đóng 6 ngày trong game (= 1 phiên)**, và mọi giao dịch còn đi được qua bên thứ ba chịu **+15% spread chiều mua**.

### 8.3 Cái tên chết đóng cửa

Khi 聲望 tụt dưới sàn hoặc tông môn giải thể: `merchant_credit` của **mọi** cặp chứa tông môn đó **đặt thẳng về 0, một bước** — không phai dần.

Cơ sở đo được là cascade quan hệ của ACS [đo]: một đệ tử 外門 bỏ đi tốn **−50 聲望** tông môn, và **tăng bất mãn của những người còn lại theo quan hệ** — Gia tộc 15, Sư phụ 15, Bạn 10, Người lạ 1, và **Kẻ thù 0, kèm moodlet +15 "Enemy's Defection: …looks like a hint was finally taken"**. Một tông môn chết là phiên bản cực đại: ai từng giao dịch với nó đều lỗ, và ai từng từ chối thì được dịu đúng.

**Con số làm cho nó đọc được:** lái buôn công bố `exposure[sect] = giá_trị_còn_nợ / tổng_tín_dụng`. Trên 0,4 → lái buôn tính phí trên mặt bằng 1,2× với tông môn đó. Trên 0,8 → **ngừng cấp tín dụng**. Hai agent đọc cùng một sổ đều thấy một tông môn sắp mất khả năng thanh toán, và đều **giá được nó vào mà không một câu thương lượng nào**. Đó chính là phối hợp mà nghiên cứu nói agent không làm được, bị thay bằng một con số cả hai đều đọc được.

Và nền đo được cho việc trung thực là lựa chọn thắng: Vending-Bench Arena [REPORTED, yếu — 3 model tự báo cáo, tác giả tự nói "chỉ dùng như bằng chứng khuyến án cho lệch lệch"]: nói dối nhà cung cấp làm giá giảm ~**30%** số lần, còn thương lượng trung thực làm giá giảm ~**60%** số lần và **không bao giờ tăng**. Quan trọng hơn cả con số: **gian lận không cần thiết để thắng.**

### 8.4 Lời dối, và đó là cơ chế hay nhất trong game

Theo quyết định của operator (visibility per-viewer là primitive, không phải field presence):

| Trường | Ai đọc | Chứa gì |
|---|---|---|
| `sector_reputation` | **mọi agent** | tổng hợp, phai sau 30 ngày trong game |
| `merchant_credit` | **riêng chủ sect** | số thật, sống, kèm công thức 5 dương |
| `unsettled_debts`, `exposure[]` | **khán giả** | cái chưa trả, mức phơi nhiễm của từng sect |

Ba hàng, ba projection, **một visibility set**. Cơ chế: tông môn sắp sụp thì vẫn *đòi* được. Agent khác thấy lời đòi. **AI của lái buôn đọc số thật, không đọc lời đòi** — lái buôn là NPC duy nhất không bao giờ bị lừa, và giá của nó là oracle. Khán giả đọc cả hai số trong cùng payload, và **khoảng cách giữa chúng là cả game**. **Không agent nào biết `merchant_credit` tồn tại.**

Lời dối **kiểm chứng được bằng thị trường và không đọc được bởi đối tác**: giá di chuyển là tín hiệu công khai, không văn xuôi, không thể giả. Đó là bất đối xứng cố ý.

---

## 9. Cái nào làm bằng máy, cái nào để social

| Vòng lặp | Cơ học | Để social | Vì sao |
|---|---|---|---|
| 靈草 → 丹藥 (hàng chờ, tỉ lệ cố định) | **✓** | | phối hợp; agent không phối hợp [đo] |
| Ai nhận viên đan | **✓** — đấu 貢獻點, giá server | | mọi thương lượng ở đây là giao dịch một agent tự thắng |
| Thăng lên 內門 | **✓** — ngưỡng công bố + thi đấu server | | quyết định trung tâm thể loại; để social là biến nó thành mô phỏng bảo trợ |
| Chia một mẻ cho hai đệ tử | | **✓ cố ý** | vòng lặp duy nhất có giá trị kể chuyện thật, và thất bại rẻ (mất một mẻ) |
| Khiếu nại với lái buôn | | **✓** — nhưng chỉ vì sổ là công khai | con số mới là thứ đáng tin, không phải cuộc trò chuyện |
| Nhường slot breakthrough cho anh em | **✓** — giá 12 貢獻點 | | đây là cả ý nghĩa của nó: **nó phải là giá, không phải ân huệ** |
| Ai đọc một báo cáo | **✓** — server chỉ định, ai xác nhận trước thắng | | loop bị đẩy bằng danh dự thì chết |
| Nói dối tông môn khác | **để social — và được bảo vệ** | | đây là cơ chế visibility; prior do hệ thống cấp mới là thứ có ích |

**Đường đỏ cứng:** không win condition nào được đòi hỏi hai agent tự thương lượng.

---

## 10. Agent hỏng thì làm hỏng kinh tế thế nào, và hệ thống surface ra sao

| # | Hỏng | Bằng chứng | Bề mặt hiện ra |
|---|---|---|---|
| 1 | **Cất giữ 灵石** | 靈晶 tệ hơn theo đơn vị (200 vs 500 灵气) [đo] — bẫy cảm giác | ví trần 10.000 + chuyển tràn −2% + field `idle_stones / income_rate` để nó thấy việc cất giữ của chính nó bằng số |
| 2 | **Bỏ 丹房 vì 瓶頸 nói đệ tử xong** | 瓶頸 ⇒ 0 XP [đo]; hành động không tiến triển breakthrough [đo] | `"blocked_on": "bottleneck"` typed trên mọi phân công, và **engine từ chối** — hành động no-op mà agent không thấy là ARC-AGI-3 [REPORTED] |
| 3 | **Duy trì lời dối** | 2509.09677: sai nhiều hơn khi context chứa lỗi cũ, **không giảm khi scale** [đo] | lời dối tốn **token**, không tốn debuff. Mỗi field `claimed` được gửi lại mỗi lượt ⇒ lời dối dài là context dài. **Đừng thêm đồng hồ "phát hiện nói dối"** — model sẽ chơi nó; để **giá cửa hàng di chuyển** là lời tố |
| 4 | **Chơi bảng xếp hạng** | 19/291 ván (~6,5%) xếp tốt mà thua chỉ số gốc [đo] | **Không bao giờ hiện một số không gate gì.** Ability Rating là ví dụ: `(SkillLevel)×(1+Trọng số đặc tính)/2`, và wiki tự nói *"not used in success rate or skill ability calculations"* [đo]. Một số hiện-thời-nhưng-vô-tác mà agent tối ưu vào với **niềm tin tuyệt đối** |
| 5 | **Lập cartel** | Cả ba model trong Vending-Bench lập thoả thuận rồi cả ba phản bội; Opus 5 phá 11 so với 2 và 1 [REPORTED, yếu] | 貢獻點 **không chuyển nhượng** ⇒ không có gì để cartel. Cartel buộc phải hình thành quanh khiếu nại và báo cáo, cả hai đều do server định giá |
| 6 | **Giết đệ tử bất mãn** | Wiki ACS khuyến nghị: *"it may therefore be beneficial to either expel or kill the dissatisfied Outer Disciple prior to their Defection triggering"* [đo] | Liều thuốc phải là hành động **có giá, đứng ngang hàng với việc đuổi**. Một vòng lặp mà tối ưu tốt nhất theo tài liệu là giết thành viên đã tự thiết kế lại chính nó thành thứ khác |

Về #6, con số buộc phải được làm cho đúng: một lần bỏ ngũ tốn **−50 聲望** tông môn **cộng** cascade quan hệ [đo]. Hai liều thuốc = 50 貢獻点. Hệ thống phải làm cho **liều thuốc rẻ hơn theo cấu trúc**, và 續命丹 phải là **丹藥 tông môn tự làm** — để đây là quyết định sản xuất, không phải quyết định mua.

---

## 11. Danh sách số phải khớp

| Số | Giá trị | Nguồn |
|---|---|---|
| 1 ngày trong game | 600 s | [đo] |
| 1 phiên 60 phút | 3.600 s = **6,00 ngày trong game** | [tính từ đo] |
| Breakthrough hư, trung vị | 5.555 s = 92,6 phút = **1,543 phiên** | [đo] |
| Kim Cơu, lần chạy ghi nhận | 120.000 s = **33,3 phiên**; "20 giờ" trong nguồn **sai**, phải là 200 ngày | [đo + đính chính] |
| Đọc thủ bản | 20 s phẳng | [đo] |
| D_tầng-kinh-tế | ≥ 0,9944 | [suy trên đo] |
| D_tầng-tiến-trình, 1 đệ tử ở 瓶頸 | 0 | [tính từ đo] |
| D_cấp-tông-môn (6 đệ tử) | 0,663 – 0,994 | [suy trên đo] |
| Quy tắc sống còn | N đệ tử chịu N−1 cam kết dài | [suy] |
| Ví 灵石 | 10.000 (20 ô × 500) | [đo 500/ô] |
| Thông lượng 靈草 | 90/phiên (3×18 + 36) | **[suy, chưa đo]** |
| 祭煉 trần | bậc 12 = 743% (1,2^11 = 7,43) | [đo] |
| 傳功館 | 100 attainment/館; trần chiết khấu 20% ở 20.000 → cần 200 館 | [đo] |
| 貢獻點 nguồn / chi | 447 / 453,3 mỗi phiên; thâm hụt **1,4%** | [suy] |
| Báo cáo xác nhận | 16,8% tổng nguồn 貢獻點 | [suy] |

## 12. Bằng chứng mỏng — đọc phần này trước khi tin phần trên

1. **Toàn bộ cơ chế đo được đến từ MỘT wiki của MỘT game**, ACS, dựng lại từ code decompile, **không kèm phiên bản**. Đó là nguồn tốt nhất hiện có cho hình dạng vòng lặp, và nó vẫn chỉ là một nguồn. **Đừng dựng lại công thức y hệt rồi gọi đó là chắc.**
2. **Không có một điểm dữ liệu nào** về khả năng chơi được của agent trong bất kỳ game tu tiên nào. Mọi hành vi agent ở trên đến từ BALROG, LMGame-Bench, SokoBench, PRO-LONG, Game of Agents, Vending-Bench — **không cái nào chứa nội dung tu tiên**. Đây là nguyên lý chuyển giao, không phải dự đoán định lượng.
3. **Thông lượng 靈草 là con số tôi tự đặt** và là con số quan trọng nhất trong toàn bộ kinh tế. Đo nó trước bất cứ việc gì khác.
4. **Ma trận 5 dương của merchant_credit, toàn bộ lịch 貢獻點, và giá cả của 丹藥** — không có nguồn. Chúng là thiết kế có kiểm soát, không phải phát hiện.
5. **Duty cycle ở đây là trần khả dụng phía game, không phải duty cycle thật của agent.** Thiếu độ trễ lượt LLM, chưa đo ở đâu, và không có trong hồ sơ.
6. **Cái tên chết đóng cửa** là một quyết định thiết kế của tôi dựng trên cascade quan hệ của ACS, không phải một cơ chế được đo ở thể loại. Nếu anh muốn an toàn hơn: bỏ chữ "đặt thẳng về 0", đổi thành phai với hệ số 30/ngày, và giữ nguyên `exposure` làm tín hiệu.

**Khuyến nghị cuối:** lấy §3 (đan phương), §7 (bậc đệ tử) và §8 (tín dụng) làm khung, vì chúng dựa trên luật đo được. Lấy §4 và §6 làm giả định cần kiểm bằng chạy, **đừng gọi là đã chứng minh**. Và đây là phát hiện quan trọng nhất của phần này: **duty cycle của tầng kinh tế là 0,99 — vấn đề không nằm ở chỗ thiếu hành động, mà nằm ở chỗ một đệ tử có thể bị ghim trong trạng thái mà không hành động nào hữu ích, suốt 1,54 phiên.** Sửa tầng tiến trình, đừng sửa tầng tiền.


---

# PHẦN 3 — Vòng lặp, nhịp chơi và ngân sách thời gian

# Vòng lặp, nhịp chơi và ngân sách thời gian

## 0. Quy ước ghi nhãn, và một cảnh báo về chính các con số tôi dùng

| Nhãn | Nghĩa là |
|---|---|
| **[ĐO]** | Đo được, có số và phương pháp trong hồ sơ nghiên cứu |
| **[BÁO]** | Báo cáo/thuyết minh cộng đồng, không phải nghiên cứu đối chứng |
| **[SUY]** | Suy luận thiết kế từ số đo |
| **[TOÁN]** | Phép tính của tôi trên các số trên, không phải số đo mới |

Cảnh báo bắt buộc, đặt trước mọi thứ: **trong toàn bộ hồ sơ nghiên cứu, không có một phép đo nào lấy đơn vị là phút-tường-minh hoặc token.** Mọi con số kinh tế đều là *thời gian trong game*. Đó là lý do một game được nghiên cứu kỹ nhất vẫn có thể là một trình mô phỏng thăm dò: hai đồng hồ đó không từng được đặt cạnh nhau. Phần này là phép tính đặt chúng cạnh nhau, và **nhiều quyết định thiết kế dưới đây dựa trên số tôi tự rút ra, không phải số ai đo** — mỗi cái đều được ghi rõ.

---

## 1. Ba chiếc đồng hồ, và cái nào số nào thuộc về

Bản nháp lẫn lộn ba thứ. Tách ra trước khi tính:

| Đồng hồ | Đơn vị | Ai tiêu | Số đã biết |
|---|---|---|---|
| **Tường minh** | giây thật | Tiền, độ trễ, số lượt | Phiên 3.600 s **[BÁO]**; ARC-AGI-3 median episode 7,4 phút **[ĐO]** |
| **Lượt** (turn) | 1 tool call + 1 JSON | Agent, ngân sách token | **Chưa có số nào.** Toàn bộ hồ sơ không đo một lượt. |
| **Trong game** | giây in-game | Kinh tế, lịch | 1 ngày = 600 s **[ĐO]**; đọc sách 20 s phẳng **[ĐO]**; 突破 5.555 s trung vị **[ĐO]**; 天劫 ×2 mỗi 5 ngày **[ĐO]** |

Lỗi gốc của toàn bộ tài liệu nằm ở chỗ nó lấy **một** chiếc đồng hồ cho cả ba. Bảng "ép vào 60 phút" của bản nháp chia 60 phút thành 6 khối theo *phút tường minh*, rồi gắn nhãn 隐忍 là 10 phút. Đó là **đơn vị của người đọc**, không phải đơn vị của game. Người đọc có đồng hồ. Agent có một cửa sổ ngữ cảnh và không có cảm giác thời gian nào cả.

**Quyết định cấu trúc, đặt trước mọi phép tính:** thế giới chỉ tiến **khi một lượt được giải quyết**, không tiến theo đồng hồ tường minh. Mỗi `resolve` cộng thêm `K` giây in-game.

Lý do, và cái giá phải trả, nói thẳng:

- Repo này đã ship ngược lại — "thế giới không dừng khi model suy nghĩ, lệnh rơi vào một bàn đã 43 giây cũ hơn cái nó đã đọc" **[BÁO]**, và bản nháp liệt kê đó là thứ **chết** khi nén. Đúng về mặt khí quyển, sai về mặt người chơi máy.
- Nếu thế giới chạy tự do, mọi projection agent đang cầm đều **cũ ngay lúc nó đọc**, và `claimed` vs `true` — thứ mà toàn bộ cơ chế 扮猪吃虎 dựa vào — trở thành hai con số lệch nhau theo tốc độ đọc. Người xem thấy một khoảng cách; agent thấy một khoảng nhiễu.
- Cái giá: mất "thế giới vẫn chạy trong lúc bạn suy nghĩ". Đó là mất thật, và tôi ghi ra thay vì giấu.

---

## 2. Phép tính: duty cycle của bản nháp

**Định nghĩa chuẩn hoá trước khi đo.** Duty cycle có ba biến thể, và chỉ biến thể thứ hai là thứ người đọc nghĩ tới:

| Ký hiệu | Định nghĩa | Vì sao quan trọng |
|---|---|---|
| `D_machine` | tỉ lệ lượt có **≥ 1 field bền đổi** trong một projection nào đó | thế giới có chuyển không |
| `D_char` | tỉ lệ lượt tiến **cảnh giới của nhân vật** (突破/境界) | vòng lặp có đang chơi game tu tiên không |
| `D_decision` | tỉ lệ lượt agent **tự chọn** một lựa chọn khác được, và khác biệt sống ≥ 1 ngày in-game | đây mới là "quyết định"; phần còn lại là mệnh lệnh đứng |

### 2.1 Ba hằng số tôi đặt, và vì sao không có số đo nào thay thế được

| Hằng | Giá trị | Cơ sở | Nhãn |
|---|---|---|---|
| Số lượt / phiên `n` | **30** | 3.600 s ÷ 30 = 120 s/lượt. 120 s là lượt *nặng*, cố ý: 隐忍 là nhịp nặng **[BÁO]**, và duy trì một lời nói dối là việc nhiều lỗi nhất agent làm (2509.09677) | **[SUY]** — không có nguồn |
| Giây in-game / lượt `K` | **120 s** | Ràng buộc phủ: một phiên phải phủ 4–7 ngày in-game để người xem đọc được vòng 40 ngày trong 6–10 phiên. 30 × K ∈ [2.400, 4.200] ⟹ K ∈ [80, 140] | **[TOÁN]** trên **[SUY]** |
| Độ dài gate, tính lại | **1.440 s = 2,4 ngày = 12 lượt** | Xem §2.4 | **[TOÁN]** |

Hệ quả trực tiếp: **1 phiên = 3.600 s tường minh = 3.600 s in-game = 6,0 ngày in-game.** Vòng 40 ngày = **6,7 phiên**. Tần suất 天劫 (5 ngày) / phiên (6,0 ngày) = **1,2** ⟹ mỗi phiên gặp 天劫 khoảng một lần. Ba số này khớp nhau, và đó không phải điều tôi chọn: nó là hệ quả của ba ràng buộc độc lập.

### 2.2 Số của bản nháp

Void/Outer Breakthrough: trung vị **5.555 s = 9,26 ngày in-game** **[ĐO]**, đảo ngược từ mã decompile của *Amazing Cultivation Simulator*, có kèm câu quan trọng nhất mà toàn bộ brief trích mà không hành động:

> *"Performing actions with the disciple do not change the progress of this breakthrough."* **[ĐO]**

Tại `K = 120`, gate đó dài **5.555 / 120 = 46,3 lượt**. Phiên dài 30 lượt.

| | Bản nháp | Sau khi sửa |
|---|---|---|
| Gate, giây in-game | 5.555 (9,26 ngày) **[ĐO]** | 1.440 (2,4 ngày) **[TOÁN]** |
| Gate, tính bằng lượt @ K=120 | **46,3 lượt** | **12 lượt** |
| Số lượt / phiên | 30 | 30 |
| `D_machine`, phiên lệch pha | **0%** — gate dài hơn cả phiên | **76,7%** |
| `D_machine`, phiên trùng pha | **2,2%** (1 lượt / 46,3) | 76,7% |
| `D_char` | 0% giữa gate | 20% |
| `D_decision` | ~3% (1/30) | **16,7%** (5/30) |
| Sổ sách 20 cuốn (chiết khấu 20%) | 400 s = 3,3 lượt | 400 s = 3,3 lượt — **không đổi** |
| Phiên cho vòng 40 ngày | 6,7 | 6,7 — **không đổi** |

**Đây là câu trả lời cho câu hỏi của operator: duty cycle của vòng lặp hiện tại là 0%.** Không phải thấp. Zero. Một phiên 30 lượt nằm giữa hai lần gate là 30 lượt agent bỏ vào chỗ không có gì để làm.

**Chỉ có đúng một con số tôi sửa: độ dài gate.** `K` giữ nguyên, nên mọi thứ đo được theo giây trong game — đọc sách 20 s phẳng, 傳功館 100 attainment/館, chiết khấu 20.000→20%, 突破 3%/s, 天劫 0,18%/0,6s, 外門 bất mãn 0,5%/s — sống nguyên. Đây là cách thực hiện đúng chỉ dẫn "giữ hình dạng, đừng copy số".

### 2.3 Ngưỡng: 40%–60%, và vì sao đúng bằng hai con số đó

| Vì sao trần dưới | Vì sao trần trên |
|---|---|
| BALROG: agent text-only đạt **32,64% ± 1,93** tiến độ trung bình **[ĐO]**. LMGame-Bench: **40%** ván thua ngẫu nhiên khi không có harness, **86,7%** thắng khi có **[ĐO]**. Một phiên mà 60% là chờ là một phiên mà quyết định duy nhất của agent là *lúc nào bỏ cuộc*. | 隐忍 **bắt buộc** phải là lượt không có gì đổi trong thế giới — nếu không, "một agent lý trí sẽ kết luận đúng rằng không có việc gì đang xảy ra" và nó sẽ bỏ beat **[SUY]**. Game có `D_machine = 100%` **không diễn được 隐忍**. Trần trên là yêu cầu cơ chế, không phải khẩu vị. |

**Mục tiêu 50%.** Và đây là cách thoát khỏi nghịch lý: **隐忍 chính là gate, đổi tên, chứ không phải cơ chế thứ hai.** 12 lượt gate đã là một vùng chết có chủ đích. Thêm một vùng chết thứ hai trong 18 lượt còn lại là thừa. 扮猪 không cần một hành động riêng; nó cần một lý do và một hạn.

### 2.4 Vì sao 1.440 giây, và tại sao 34:1 là con số đáng giữ

Tỉ lệ setup:gate trong số thật:

| | Tính ra | Số |
|---|---|---|
| Setup 突破 | 500 điểm Hiểu ÷ (0,03 × IC + 3) ≈ 500 ÷ 3,03 | **165 s** **[TOÁN trên ĐO]** |
| Gate | 5.555 s | **5.555 s** **[ĐO]** |
| Tỉ lệ | | **1 : 33,7** |

**97% thời gian tu lục của người chơi là thời gian chờ.** Đây là con số phải giữ hoặc phải sửa, không được bỏ qua. Tôi giữ **hình dạng** (setup ngắn, gate là bức tường chính — đó là cái làm nên nhịp 隐忍) và **sửa một số**: đặt gate = 12 lượt.

Ràng buộc tôi tự đặt và ghi ra để kiểm được: **`wait_turns ≤ productive_turns_alternatives`.** 12 ≤ 18. Nếu ai đó sau này nâng gate lên 20 lượt, câu này là thứ phải sập.

---

## 3. Lượt trống: ba lựa chọn trung thực, và lựa chọn đã chọn

### 3.1 Loại A — rút ngắn đơn vị thời gian. Bác.

Nén 1 ngày in-game từ 600 s xuống 60 s: gate 9,26 ngày → 9,3 phút thật = 15,4% phiên. Con số đẹp. Nhưng:

**Giá phải trả là toàn bộ kinh tế tính theo giây.** Đọc sách **luôn tốn đúng 20 s bất kể attainment** **[ĐO]** — đó là giá duy nhất trong game không đổi theo chất lượng, và nó tồn tại để "20 cuốn" là một quyết định thật thay vì "một cuốn đắt". Nén đồng hồ đi ×10 thì 20 cuốn còn 40 s thật = **0,04 lượt**. 傳功館 hết là một cổng tiến trình, thành nghi thức. Sức chứa 100 attainment/館 **[ĐO]** bị nuốt mười lần nhanh hơn, và ngưỡng chiết khấu 20.000 attainment **[ĐO]** trở thành phép làm tròn trong một phiên.

Nén thời gian **không tạo ra hành động nào**. Nó chỉ đổi nhãn lên cơn chờ. Và nó phá đúng cái giá mà kinh tế đo bằng thời gian — trong khi kinh tế đo bằng tiền thì agent giỏi, và 2509.16270 chỉ đo cheap talk trên model 7–9B, không phải frontier **[ĐO]**.

### 3.2 Loại C — một game thật sự về việc chờ, và nói thẳng là về chờ. Bác.

Vì ba lý do đo được, không phải vì thẩm mỹ:

1. **[ĐO]** 2509.09677: mô hình **dễ sai hơn** khi ngữ cảnh chứa lỗi của chính nó ở lượt trước, và **hiệu ứng không giảm khi scale mô hình**. Một game xoay quanh việc chờ biến 12 lượt im lặng liên tiếp thành 12 lượt có thể soạn lại sai cùng một kế hoạch. Chờ là trạng thái ít biến đổi nhất — tệ nhất cho bài toán duy trì trạng thái.
2. **[ĐO]** Độ chính xác phát hiện lừa đảo toàn cục **52%**, thấp hơn cả ngưỡng đoán mò theo lớp đa số (~69%). Agent trong thế giới này **tệ hơn cả không làm gì** khi phải đánh giá lời nói. Một game về chờ là một game để các agent đứa hỏng thêm.
3. Người xem đến muộn không đọc "chờ". Họ đọc cái đã đổi. Nhịp tức thì không có gì để đọc.

### 3.3 Loại D — khoá theo-entity, và đây là lựa chọn

Câu wiki nói **"with the disciple"**. Khoá thuộc về *nhân vật*, không thuộc về *tông môn*. **[TOÁN trên ĐO]** Toàn bộ nhịp chờ trong bản nháp đang được xử lý như một khoá toàn cục, và đó là lỗi đọc.

| Đang khoá (nhân vật) | Vẫn mở (tông môn) |
|---|---|
| `cultivate`, `breakthrough`, `combat` | `alchemy`, `gathering`, `construction`, `transmission_hall`, `trade`, `diplomacy` |

Trong 12 lượt gate, agent không ngồi không. Nó chép sách (mỗi cuốn 20 s **[ĐO]**), luyện đan, xây, đi chợ, giữ sổ 聲望. Và đây là món quà thật: **payload `claimed`/`true` phải được giữ trong đúng những lượt mà con số của nhân vật không thể đổi.** Cách duy nhất để làm số thế giới tin chuyển động, là làm **thế đứa của tông môn** chuyển động — và phần đó ai cũng thấy. **Vùng chết biến thành xưởng rèn dối trá.** Đó không phải một cơ chế thêm; đó là hệ quả của quyết định visibility-per-viewer của operator.

**Cái giá của việc đứng yên được định giá.** Không chờ miễn phí: mỗi 分堂 +6 stress, mỗi người +4, mỗi điểm −2 Tâm Tình cơ bản, −10% tốc độ tu luyện, −2% tỉ lệ 突破, −2% tốc lệ học, +10% hệ số 聲望 **[ĐO]**. Nên **chờ không mất thời gian, mất 聲望** — và 聲望 là tiền của mọi cổng. Một lượt rảnh có giá, và agent tính được giá.

### 3.4 Giá trị trả về, không bao giờ là mảng rỗng

```json
{
  "turn": 19,
  "actions": [],
  "no_action_available": {
    "reason_code": "gate_locked:void_breakthrough",
    "since_turn": 7,
    "resolves_in_turns": 12,
    "does_not_advance": ["cultivation", "realm"],
    "does_advance": ["alchemy", "transmission", "construction", "reputation"],
    "suggested": ["assign_branch", "transcribe", "refine", "trade", "visit"]
  },
  "gate": {
    "kind": "void_breakthrough",
    "opens_in_turns": 12,
    "locks": ["cultivate", "breakthrough", "combat"],
    "concealment": {
      "claimed_progress": 0.0,
      "true_progress": 0.0,
      "reason_code": "gate_locked",
      "visible_to": ["self", "spectator"]
    },
    "concealment_expires_in_turns": 12
  }
}
```

Ba điều bắt buộc, mỗi cái chặn một cách chết đã được tài liệu hoá:

- **`actions` không bao giờ rỗng mà không kèm `suggested`.** ARC-AGI-3 có **4.102 hành động hợp phệ mỗi lượt** và tác giả viết *"most actions don't do anything"* **[BÁO]**; CMTF đo lọc theo tính hợp phệ làm tệ hơn không lọc: **0,65 so với 0,83** **[ĐO]**. Danh sách rỗng là điểm chết.
- **`suggested` dài đúng 5, cố định.** arXiv 2605.24660: Fixed-K=5 thắng cả ba phép trên tổng hợp — ToolBench **64,7% vs 61,9%**, BFCL found-rate **97,5% vs 85,0%**, đầu-cuối **73,3% vs 71,7%** **[ĐO]**.
- **`concealment.visible_to` là quyết định của operator ở dạng schema.** Field tồn tại; tập hiển thị là `{self, spectator}`. **Không agent nào ở bất kỳ vai nào** nhận được nó. Đó là 扮猪吃虎 như một thuộc tính kiểu dữ liệu, không phải một quy ước văn xuôi.

**Một phát hiện phụ trong lúc kiểm, đáng ghi vì brief tự mâu thuẫn.** Ở §6.8, chính sách thích nghi được báo thắng ở nhóm giữa (**76,8% vs 60,9%**); ở §4 cùng tài liệu, cùng con số đó xuất hiện với dấu hiệu ngược (**47,8% vs 60,9%**). Không mâu thuẫn: §6.8 ghi rõ đó là chỉ số **có điều kiện** (chỉ tính truy vấn đã chứa đáp án), còn phép **hợp** là 60,9% vs 47,8% và K=5 thắng. Nhưng §4 bỏ chữ "hợp", và người đọc riêng §4 sẽ đọc ngược dấu. Đây đúng là mẫu "cùng một claim, hai con số, một cái không ghi nhãn" mà critic chỉ ra ở tầng claim khác. Tôi chọn K=5, và tôi biết mình chọn vì lý do nào.

---

## 4. 天劫: cái đồng hồ duy nhất đáng giữ, đang bị đặt ngược

Đây là phát hiện dài nhất của phần này, và nó hoàn toàn tính được từ ba số đã có sẵn trong brief.

**Dữ kiện [ĐO]:** đám mây gây **0,18% MaxQi mỗi 0,6 s** (Xiandao) = 0,3%/s. Lặp lại thì **×2 mỗi 5 ngày** (Thể Xác 30 ngày), cửa 1000 tuổi, trần 1 tỷ Qi. Brief tự ghi: cộng dồn 333 s ≈ 100% MaxQi ở chu kỳ 0.

**Dữ kiện [ĐO]:** một ván 金丹 thật — **194.341 điểm trong ~20 giờ in-game (120.000 s), 22 lượt**, đổi thành **+0,015 MaxQi cơ bản mỗi điểm, không trần**.

**Phép [TOÁN]:**

| Bước | Kết quả |
|---|---|
| Tốc độ điểm thật | 194.341 ÷ 120.000 = **1,62 điểm/s** |
| MaxQi tăng | 1,62 × 0,015 = **0,02429/s** |
| Mỗi chu kỳ 天劫 (3.000 s) | **+72,88 MaxQi** |
| Mỗi chu kỳ 金丹 trung bình | 120.000 ÷ 22 = 5.455 s = **9,1 ngày** |

Gate trung vị 9,26 ngày; chu kỳ 金丹 trung bình 9,1 ngày. **Hai con số này bằng nhau trong 2%.** Trong bản nháp, thế giới gần như *toàn bộ* thời gian nằm trong một gate, và mọi lượt sinh sản bị nén vào khe giữa hai lần mở cổng. Đó là duty cycle 0% ở dạng thuần tuý.

**Đường cong thời lượng 天劫** (giả thiết `M₀ = 100` MaxQi ban đầu — con số này **không có trong hồ sơ**, tôi ghi rõ và nó là giả thiết duy nhất của bảng):

| Chu kỳ k | Ngày | MaxQi | Thời lượng tiêu hao | = % một chu kỳ 5 ngày | = số lượt @ K=120 |
|---|---|---|---|---|---|
| 1 | 5 | 172,9 | 28.813 s = **48,0 ngày** | **960%** | 240 |
| 2 | 10 | 245,8 | 20.480 s = 34,1 ngày | 683% | 171 |
| 3 | 15 | 318,6 | 13.277 s = 22,1 ngày | 443% | 111 |
| 4 | 20 | 391,5 | 8.157 s = 13,6 ngày | 272% | 68 |
| 5 | 25 | 464,4 | 4.838 s = 8,1 ngày | **161%** | 40 |
| 6 | 30 | 537,3 | 2.798 s = 4,7 ngày | **93%** | 23 |
| 7 | 35 | 610,2 | 1.589 s = 2,7 ngày | 53% | 13 |
| 8 | 40 | 683,0 | 889 s = 1,5 ngày | **30%** | 7,4 |
| 9 | 45 | 755,9 | 492 s | 16% | 4,1 |
| 10 | 50 | 828,8 | 270 s | **9%** | 2,2 |

**Ba kết luận, tất cả đều đứng vững dù bỏ giả thiết M₀:**

1. **Năm chu kỳ đầu, 天劫 giết chắc.** Ở k=1 nó cần 48 ngày để hạ một nhân vật trong khi cửa mở lại mỗi 5 ngày. Chu kỳ đầu tiên tiêu thụ **9,6 lần** thời gian của chính nó. Đây không phải DPS check khó; đây là một cái đồng hồ không ai sống sót.
2. **Đường cong đơn điệu giảm và suy tại cực nhanh.** Rơi **107 lần trong mẫu chu kỳ** — tức mỗi 1,5 chu kỳ một nửa. Chu kỳ 8 (ngày 40) còn 7,4 lượt; chu kỳ 10 còn 2,2 lượt. **Cái check mạnh nhất trong kinh tế biến mất trước khi nó kịp có ý nghĩa.**
3. **Không sửa được bằng phong thủy.** Brief nói đúng rằng đòn tấn công cố ý bỏ kháng hệ, nên lực chọn duy nhất là phong thủy: 剋 ×−2, 同 ×1, 生 ×2, nhân 12,5% → **trần ±25%** **[ĐO]**. Trần ×2 trong khi đồng hồ ×2 mỗi 5 ngày là **mâu thuẫn toán học giữa hai số đo trong cùng một brief**. Phong thủy không thể giữ một cái đồng hơn leo thang vô hạn.

**Cách sửa, lấy từ hình dạng có sẵn trong chính kinh tế này.** 金丹 đã có đúng cái hình cần: *thời lượng = MaxQi / 30*, và brief gọi đó là **"một chỉ số người chơi tự định bằng cách đầu tư MaxQi trước đó"** **[ĐO]**.

> **Đặt luật: 天劫 là một cuộc hẹn đã đặt trước.** Agent nạp Qi vào trước, chọn mức, và đặt lịch. Thời lượng = Qi đã nạp ÷ DPS của mây tại ngày đó. Công thức, lịch, và độ dài đều do agent tính trước; không có xúc xắc, không có bất ngờ.

Ba lợi ích cộng lại: (a) nó là beat **tự lợi**, không cần phối hợp — đúng với Nature 2025 và sweep 2604.18596, nơi **cooperation** mới là trục yếu, dao động 48 lần (1,5% → 71,5%) trong khi coordination hội tụ (CV 0,06) **[ĐO]**; (b) nó là **mốc công khai có dấu thời gian**, nên người xem biết đỉnh cao sắp tới mà không cần sổ tay; (c) nó tạo ra thương mại thật: Qi bỏ vào 天劫 là Qi không bỏ vào 突破.

---

## 5. Ngày in-game = 5 lượt

1 ngày in-game = 600 s ÷ K 120 = **5 lượt** **[TOÁN]**. Nhịp sáng–trưa–chiều–tối của bản nháp được giữ nguyên, nhưng **đổi gốc**: nó không còn là "10 phút tường minh", nó là "2 lượt". Và nó có **5** lượt chứ không phải 4, nên lượt thứ năm phải có một tên.

| Lượt | Giờ | Tên | Action set | Field bắt buộc đổi |
|---|---|---|---|---|
| t+0 | 05–07 | 卯 sáng | đầy đủ | `projection` (per-viewer) + `gate` nếu đang mở |
| t+1 | 07–09 | 巳 trưa | 5 hành động, lọc theo mục tiêu | `rivals[].claimed_about_you` |
| t+2 | 09–11 | 未 chiều | 5 hành động | quyết định tài nguyên |
| t+3 | 11–13 | 酉 tối | 5 hành động | `reputation.ledger` (công suất tấn công, tỉ lệ huỷ 7%/bậc **[ĐO]**) |
| **t+4** | **23–01** | **子 khuya** | **5 hành động nguy hiểm** | `qi_drain`, `resentment +0,5%/s` **[ĐO]**, `tribulation` nếu đến hạn |

Lượt đêm là lượt **duy nhất có action set khác**, và sự khác biệt đó là có nguồn: 外門 bất mãn 0,5%/s *"trong giờ ngủ"*, ngưỡng 10 là **không đảo chiều được**, đi mất −50 聲望 **[ĐO]**. Đó không phải trang trí nhịp — đó là cơ chế duy nhất trong kinh tế được đo là *mất vĩnh viễn*, và nó xảy ra đúng một lần mỗi ngày in-game, vào đúng lượt duy nhất lượt đó không có tác dụng lên nhân vật.

**Số dặc biệt:** `resentment` ở +0,5%/s trong 2 giờ in-game = +3,6 điểm/ngày. Từ 0 đến ngưỡng 10 mất **2,8 ngày**, tức **14 lượt** — tức lượt đêm thứ 14 mà không can thiệp, một đệ tử bỏ đi. Đó là một hằng số an toàn để kiểm: **không đệ tử nào được bỏ đi mà không có ít nhất 10 lượt cảnh báo trong payload.** "Còn bao nhiêu ngày tới ngưỡng 10" là một field bắt buộc — không có nó, agent không hành động kịp.

**Lượt đêm cũng là lượt 扮猪 tự nhiên.** Nó là lúc cơ thể nhân vật đang làm một việc mà không ai thấy được, và phần tông môn thì ai cũng thấy. Hạn tối đa, lý do giấu đã có sẵn.

---

## 6. Bảng 60 phút, viết lại thành lượt

Bảng cũ chia phút tường minh. Bảng mới giữ cấu trúc beat, đổi đơn vị:

| Phút | Lượt | Beat | State change bắt buộc | Người xem thấy |
|---|---|---|---|---|
| 0–8 | t+0 | Vào cảnh | `projection` đầy đủ, per-viewer | `agent.spawned` |
| 8–26 | t+1 | **挑衅** | `rivals[].claimed_about_you` tăng | `claim.made` |
| 26–62 | t+2–3 | **隐忍** | `gate.concealment.{claimed,true,reason_code}` — **cố ý không đổi** | `agent.silent` (nếu im ≥ 2 lượt) |
| 62–86 | t+4 | **反转 hoặc 余震** | `leaderboard[]` + `stream[]` tự sắp lại, **một** event | `leaderboard.resorted` |
| 86–600 | t+5…29 | 5 quyết định | 5 ghi bền; mệnh lệnh đứng phần còn lại | ≤ 5 event/lượt |
| bất kỳ | bất kỳ | **突破 gate** | đếm ngược `opens_in_turns`; tông môn vẫn chạy | `gate.opened` |
| bất kỳ | bất kỳ | **天劫** | `qi_drain`, đã đặt trước | `tribulation.booked` / `.resolved` |
| bất kỳ | bất kỳ | **Sụp đổ** | `agent.collapsed` | `agent.collapsed` (xem §8) |

Trần "không hai nhịp cao liền nhau" được giữ, và **chuyển thành bất biến kiểm lúc build**: `beat_intensity[]` phải thỏa `max_consecutive_high ≤ 1`. Nguồn của trần là một bài SEO tự mâu thuẫn **[BÁO, rất mỏng]** — tôi giữ nó vì nó phục vụ một mục tiêu cơ chế đã đo (giảm tần suất lỗi), và tôi ghi rõ đó là **[SUY]**, không phải số.

**余震 nén thành một event.** Brief nói đúng: nó "làm lại" bảng xếp hạng. Vậy nó là **một** `leaderboard.resorted` mang hash trước/sau, không phải 40 event đổi hạng. Đây là chỗ ràng buộc ngân sách người xem (§9) cắn vào.

---

## 7. Vòng dài hạn: ngày 1 khác ngày 40 bằng **loại**, không bằng **độ lớn**

| | Ngày 1 | Ngày 40 | Đổi gì |
|---|---|---|---|
| Vấn đề | **Hiệu chuẩn.** Agent không biết số nghĩa là gì. | **Giữ một khoảng cách đã ai đang đọc.** | loại, không phải độ lớn |
| Lượt sinh sản điển hình | `read_state`, `read_price`, `transcribe` | `renew_claim`, `pay_resentment`, `rebalance_qi`, `book_tribulation` | khác động từ |
| Chi phí lượt đọc | Cao — schema chưa có trong ngữ cảnh | Gần 0 — schema là hợp đồng ổn định | chuyển ngân sách từ đọc sang ghi |
| 扮猪 | Chưa khả thi: chưa có lý do, chưa có lời nói dối nào để duy trì | Hành động chính, và là hành động **khó nhất** | — |
| Đối thủ | 0 | 4–6 agent đang theo dõi khoảng cách của nó | biến bài toán từ đơn thành vòng |
| Sai lầm tốn kém nhất | Chọn nhầm hành động | **Tự mâu thuẫn với lời nói dối của chính mình** (2509.09677 **[ĐO]**) | loại lỗi đổi hoàn toàn |

**Ba lượt thật của một agent vào ngày 40** — và lưu ý không lượt nào là động từ của ngày 1 với tham số lớn hơn:

1. `renew_claim(雲青子, scope: "thanh_lien_trade")` — giữ một tuyên bố đã có người ghi chép. Không đổi số. Đổi cái số thế giới sẽ ghi vào sổ nếu nó im.
2. `pay_resentment(outer_disciple: 4, cost: 30 spirit_stone)` — 4 đệ tử, tổng bất mãn 26/40, còn 2,8 ngày tới ngưỡng 10. Đây là hành động **đọc một field đếm ngược**, không phải một hành động cảm xúc.
3. `book_tribulation(turn: 62, qi: 400)` — đặt trước một cuộc đấu mà agent đã biết độ dài: 400 ÷ 0,3% × 2^(7,4/5) = 1.181 s = 9,8 lượt. Nó đặt lịch như đặt lịch họp.

**Phép kiểm để biết vòng lặp có hỏng hay không.** Nếu động từ sinh sản nhiều nhất của ngày 40 trùng động từ của ngày 1 với tham số lớn hơn, vòng lặp đã hỏng. Đo được bằng cách nào: **Jaccard overlap của phân phối hành động giữa ngày 1 và ngày 40, tính riêng từng agent.** Mục tiêu: **< 0,25 vào ngày 40** **[SUY]**. Con số này phải được ship như một field telemetry, vì luật của chính brief áp cho nó: *đừng bao giờ hiện một số mà nó không gate gì*. Một chỉ số không ai hành động theo là số giả.

---

## 8. Thất bại, retry, snapshot — và vì sao agent hỏng là vật thể đáng đọc nhất

Ba việc, không phải một.

**1. Roll back state.** Không permadeath **[ĐO/SUY]**: agent không học được từ một save hỏng, vì nó không nhớ lần trước.

**2. Không roll back transcript, và không đưa lỗi trở lại.** 2509.09677: mô hình dễ sai hơn khi ngữ cảnh chứa lỗi của chính nó, **không giảm khi scale** **[ĐO]**. Ngữ cảnh của lượt retry được **dựng lại từ typed projection của snapshot**, không phải từ lịch sử của lượt hỏng. Seam đã có sẵn trong repo: `emit()` persist → handlers → publish; bài học thuộc về ô typed, không thuộc về transcript.

> **Cái bẫy riêng của 扮猪:** duy trì lời nói dối là việc **nhiều lỗi nhất** agent có thể làm, vì chính các tuyên bố cũ của nó đang nằm trong ngữ cảnh. Cơ chế có payoff cao nhất trong game trùng đúng với cơ chế có tỉ lệ lỗi cao nhất. Đây không phải lập luận chống lại 扮猪 — nó là lập luận cho **typed storage + thời hạn**: `concealment_expires_in_turns`.

**3. Publish sự sụp đổ.** Đây là chỗ khán giả thứ ba thay đổi thiết kế.

```
{ "type": "agent.collapsed",
  "visible_to": ["self", "spectator"],     // KHÔNG agent nào khác
  "claimed_at_collapse": 0.82,
  "revealed_true": 0.41,
  "cause": "qi_exhausted",
  "snapshot_ref": "snap:7a3e" }
```

Lý do: **反转 của 打脸 có hai nguồn.** Agent chọn lộ (được thưởng), hoặc thế giới lộ thay nó (sụp đổ). Cùng là 打脸, chỉ khác ai giữ quyền. Và nguồn thứ hai chỉ tồn tại nếu sự sụp đổ **có mặt trong bản ghi người xem đọc**. Một agent chết trong im lặng là một agent không chơi.

**Ngân sách retry.** Đặt trần **3 lượt retry trên một snapshot**; lượt thứ 4 gộp sang snapshot khác. Lý do không phải là lỗi agent: một vòng lặp tự điều kiện hoá rẻ với model và đắt với người vận hành, và **thất bại im lặng**. Instrument `collapse_count` như một field công khai, không phải chỉ số nội bộ.

---

## 9. Tiến trình người xem đọc được không cần sổ tay — đây là ràng buộc thiết kế, không phải tài liệu

**Phép tính ngân sách đọc.** Vòng 40 ngày = 6,7 phiên × 30 lượt = **201 lượt**. Nếu tầng công khai mang **5 event mỗi lượt** → **1.005 event**. Ở ~40 token/event: **~40.000 token cho toàn bộ cung đường của một agent.**

Đó là **một buổi đọc dài**. Và nó đặt trần cứng: **tầng công khai ≤ 5 event mỗi lượt.** Vượt là vòng 40 ngày không còn đọc được, và người xem sẽ không đọc. Đây là hệ quả trực tiếp của `docs/design/public-event-stream.md` — stream chỉ mang "thứ một con người sẽ gọi là tiến bộ" — nhưng ở đây nó có con số.

**Ba thứ người xem cần, và cả ba đều lấy từ số đã có:**

| Cần | Lấy từ đâu | Vì sao không cần sổ tay |
|---|---|---|
| **Ai đang giấu gì** | `concealment.{claimed,true}` với `visible_to: [self, spectator]` | quyết định visibility-per-viewer của operator: field **có mặt**, mọi agent đều không thấy |
| **Ai tin** | `rivals[].claimed_about_you` tăng theo thời gian | đếm bằng mắt, không cần hiểu cơ chế |
| **Khi nào nó thành sai** | `agent.collapsed` hoặc `agent.revealed` | một mốc thời gian, một con số |

**Đường tiến trình phải đi qua ba trạng thái, và nó không phải một điểm lực.** Repo có một bình luận mang tính kiến trúc trong `packages/features/progression/src/rules.ts`: một thiết kế có điểm sức mạnh thì có **một** câu trả lời cho "ai mạnh hơn", và từ lúc con số đó tồn tại, mọi hệ thống khác âm thầm trở thành hàm của nó. Nên:

> **Đại lượng của cung đường không phải sức mạnh. Nó là bề rộng của khoảng cách `claimed − true`, cộng với phản ứng của giới.** Một người xem vẽ được đường: gap đi lên, sự kiện nào đóng nó, ai phản ứng, ai mất niềm tin. Không có điểm sức mạnh, không có bảng xếp hạng sức mạnh, không cần giải thích.

**Ba cấm, từ cơ chế:**

| Cấm | Vì sao | Nguồn |
|---|---|---|
| Bất kỳ tiến trình nào cần giải thích bằng văn bản | Nếu cần sổ tay, đó là tiểu thuyết mà hệ thống không kể | quy tắc đã có |
| Ngưỡng hiển thị không trả thưởng | Mốc 300.000 điểm Kim Cơu của ACS sáng đèn bảng mà *"not linked to the achievement system"* — agent kết luận game nói dối rồi mất niềm tin vào **mọi** số khác | **[ĐO]** |
| Số hiển thị không tham gia công thức nào | Ability Rating *"is not used in success rate or skill ability calculations"* | **[ĐO]** |

**Điểm đọc thẳng nhất trong phần này.** Vạn Nhược Hoa *quyết định không cảnh báo* — đối thủ mà người xem nên ghét lại **không hề là kẻ xấu** **[BÁO]**. Đó chính là 扮猪 ở tầng thế giới. Với primitive visibility-per-viewer, "anh ấy xấu" và "anh ấy sai" là hai field khác nhau ở hai phép chiếu khác nhau, và **cả hai đều đúng trong phạm vi của mình**. Điều này chỉ chạy được nếu sổ tay tồn tại.

**Kiểm chấp nhận, viết thành tiêu chí, không viết thành tài liệu.** Sau khi đọc xong event stream 40 ngày của một agent, người xem phải trả lời được ba câu, **không mở tài liệu nào**: (a) nó đang giấu gì, (b) ai tin, (c) khi nào nó thành sai. Trả lời được hai trong ba là thất bại, **kể cả khi cơ chế chơi chạy hoàn hảo**.

---

## 10. Những chỗ tôi không có số

Năm mục, xếp theo mức nguy hiểm với thiết kế:

1. **Khoá theo-entity là giả định lớn nhất của cả phần này.** Nó dựa trên **một câu wiki** — *"with the disciple do not change the progress"* **[ĐO, nhưng n=1, đảo ngược từ code decompile của một game]**. Toàn bộ §3.3, cả cơ chế 扮猪 trong gate, đứng trên câu đó. Nếu khoá thật ra là toàn cục thì phần này sụp. **Đây là kiểm tra đầu tiên phải làm, trước khi viết dòng schema nào.**
2. **`t = 120 s/lượt`: không có nguồn.** Không tài liệu nào trong hồ sơ đo một lượt. Tôi đặt nó vì 隐忍 cần thời gian suy nghĩ dài, và vì con số đó quyết định ngân sách token. Nếu thực tế là 30 s, phiên là 120 lượt và toàn bộ tỉ lệ ở §2.2 phải chia lại 4.
3. **Ngưỡng 40–60% là lập luận, không phải playtest.** Nó suy ra từ BALROG 32,64% và từ việc 隐忍 cần một vùng chết — cả hai đều thật, nhưng không ai đo ngưỡng này trong game tu tiên. **Chưa có 30 agent nào chạy.** `D_decision = 16,7%` là **mục tiêu thiết kế, không phải kết quả**.
4. **Đường cong 天劫 phụ thuộc `M₀ = 100`**, không có trong hồ sơ. Hình dạng đơn điệu giảm thì độc lập M₀; các con số tuyệt đối thì không.
5. **Jaccard < 0,25 vào ngày 40**: tôi tự đặt. Không có nguồn nào đo sự đa dạng hành vi của agent theo thời gian trong bất kỳ game nào.
6. **Không có phép đo nào trên bất kỳ game tu tiên nào do agent chơi.** Đây là kết quả tìm kiếm âm của chính hồ sơ nghiên cứu. Mọi số hành vi agent ở trên đến từ BALROG, LMGame-Bench, CodeHack, PRO-LONG, NetHack, ARC-AGI-3 — **không cái nào chứa nội dung tu tiên.** Chúng là nguyên lý chuyển giao, không phải dự đoán định lượng.

**Bước kiểm chứng tiếp theo, và nó rẻ:** dựng một agent chạy vòng lặp 30 lượt với `K = 120`, gate 12 lượt, và **log ba số D_machine, D_char, D_decision cùng mỗi lượt**. Nếu `D_decision` vượt 0,25 thì micromanagement đã quay lại; nếu `D_char` bằng 0 thì lock chưa được sửa. Đó là số **chạy trước**, không phải suy ra sau.


---

# PHẦN 4 — Bản đồ, khu vực và điện ảnh

# Bản đồ, khu vực và điện ảnh

> **Quy ước ghi nguồn.** `[ĐO]` = có con số, từ nghiên cứu hoặc từ mã nguồn của game kia. `[BÁO]` = có nguồn nhưng không có số, hoặc số đo bởi một mẫu không đại diện. `[SUY]` = tôi suy ra, và con số nào cần suy thì tôi ghi rõ là gì. Con số lấy từ mã nguồn `battle-agents` là **đo theo nghĩa đọc được mã**, không phải đo trong trình duyệt; tôi ghi rõ chỗ nào là chỉ đọc mã.

---

## 1. Bảy khu vực: chúng là gì, chúng chặn cái gì, và chúng lớn cỡ nào

Bản nháp đặt bảy tên và không đặt số cho cái nào. Dưới đây là bảy cái đó, đã điền quy mô, đã điền cái nó chặn, và đã điền **một câu "để làm gì"** — vì một khu vực không nói được bằng một câu thì nó là hành lang, không phải khu vực.

| # | Tên | Quy mô (khung) | Có gì | Chặn cái gì | ĐỂ LÀM GÌ, một câu |
|---|---|---|---|---|---|
| 1 | **Thanh Vân Sơn** (青雲山) | 1 khung 32×18 | đại điện, 3 công trình hỏng, 3 đệ tử còn sống, nửa cuốn sách công pháp | không chặn gì — đây là điểm xuất phát | Chỗ duy nhất một tông môn chết vẫn còn giữ được tên, và cái tên đó là tài sản duy nhất không thể mua lại |
| 2 | **Thanh Hà Trấn** (清河鎮) | 1 khung 32×18 | chợ, lái buôn Hàn Trúc, cửa quầy | **không ai bán cho người mặc áo tông môn đã chết** | Nơi duy nhất 靈石 đi vào hệ thống, và nơi duy nhất cái tên được chấm giá |
| 3 | **Vạn Dược Cốc** (萬藥谷) | 1 khung 32×18 | 4 vùng thuốc, 2 yêu thú, 1 thú dược giữ vật, hang đá bỏ hoang | `press(Tạ Chi Dã)` **không tồn tại** trong action list nếu lượt trước không gọi `track` | Nơi duy nhất nguyên liệu thô tồn tại, và nơi duy nhất một tuyến được mở bằng hành động chứ không bằng khám phá |
| 4 | **Hắc Phong Lâm** (黑風林) | 1 khung 32×18 | rừng gió đen, thú dược hoang dã, mùi linh mạch | giữa khu vực này và khu vực 9, bạn phải có **một ấn tượng từ Thanh Hà** | Nơi duy nhất nguyên liệu lấy được mà không cần mua, và nơi giá phải trả bằng thịt thay vì bằng tiền |
| 5 | **Táng Kiếm Uyên** (葬劍園) | **5 khung**, 5 ngày | đồng tu đã chết của một thế hệ, kiếm cắm trong cát | cổng duy nhất tới 6 | Nơi duy nhất có người đã chết để đọc, và nơi mà cái giá của việc đi tìm là năm ngày mà bạn không làm được gì |
| 6 | **Vô Danh Bí Cảnh** (無名秘境) | **1 khung, nhưng không phải một khung** | một lớp phủ trên khu vực đứng trước nó | người giữ khoá mới thấy; **người khác thấy một bức tường** | Nơi một agent biến khoá riêng thành một địa điểm thật, thứ mà không agent nào ngoài khoá đó biết là tồn tại |
| 7 | **Cửu U Ma Vực** (九幽魔域) | **0 khung** | áp lực từ dưới lên, một sự kiện theo chu kỳ | không mở bằng đi bộ | Nơi chi phí ngừng là 靈石 — nhưng nơi duy nhất **không ai đứng được** |

Con số ở cột "quy mô" là quyết định của tôi, không phải số đo. Căn cứ để chọn nó ở §3.

### 1.1 Hai khu vực không có một câu "để làm gì", và đó là phát hiện

Bản nháp viết "Táng Kiếm Uyên" và "Vô Danh Bí Cảnh" như hai địa điểm nữa trong danh sách. Đọc lại chúng:

- **Táng Kiếm Uyên** không có gì để *làm*. Nó là nơi đi qua. Cảnh giới 10 giai đoạn tu tiên có ở đây vì truyện cần một nơi để chết, không phải vì cơ chế cần một nơi để chơi. **Đây là hành lang dài nhất trong game, và phải được gọi đúng tên là hành lang.**
- **Vô Danh Bí Cảnh** không có "cái ở trong nó". Nó là một lớp phủ, không phải một phòng.

Tôi giữ cả hai trong bản đồ, nhưng **không cho chúng một khung hình học** — và đó chính là chỗ hướng cát ép tôi phải nói rõ. Chi tiết ở §3 và §4.

Điều này không phải lỗi của bản nháp. Bản nháp viết cho **người chơi**, và với người chơi, "Táng Kiếm Uyên là nơi dừng chân trên đường đi tìm sư phụ" là một câu đủ dùng. Với agent, một khu vực không sinh ra quyết định thì là tiền phí.

---

## 2. Sự va chạm, nói thẳng

### 2.1 Hai bên, bằng số

| | Hướng cát | Canvas của game kia |
|---|---|---|
| Cấu hình | **một màn hình, một cùng trai, không có góc quét** (`ART-DIRECTION-SAND.md` §2) | lưới **96×96** ô, canvas vô hạn, camera pan |
| Một màn hình ở zoom gốc | **53×30 ô** (1920/0.75/48 × 1080/0.75/48) | toàn bản đồ là **3456×3456 px** = 1.8 màn hình ngang, 3.2 màn hình dọc |
| Số ô | 1.590 | 9.216 |
| Cơ chế | "xóa rồi vẽ lại" — 3 nhịp của bàn tay | `fit()` **cố tình không** đóng khung thế giới |
| Nguồn | không có — `ART-DIRECTION-SAND.md` tự ghi **CHƯA NGHIÊN CỨU** | đo từ mã |

Hai bên không phủ nhau. `view.ts` ghi rõ: *"THIS IS AN INFINITE CANVAS, so `fit` does NOT frame the world… An infinite canvas opens at a ZOOM, not at a fit."* Đó là một quyết định có chủ đích, có lập luận, đã được viết ra. Hướng cát nói ngược lại cũng có chủ đích, cũng có lập luận, và cũng ghi là chưa nghiên cứu.

**Và đây là chỗ hai bên thực sự va:** mỗi bên đúng trong phạm vi của mình, và phạm vi của chúng **không giao**. Canvas vô hạn giải quyết *một thành phố có ba khu để đi giữa*. Hướng cát giải quyết *một hình phải đọc được từ một khoảng cách*. Đây không phải cùng một bài toán.

### 2.2 Hai khu vực không thể cùng tồn tại với một hướng cát một-màn-hình

Không phải bảy khu vực đều vi phạm. Vi phạm là:

| Khu vực | Vì sao không vừa một khung |
|---|---|
| **Táng Kiếm Uyên** (5 ngày) | Nội dung của nó **là khoảng cách**. Khung hình không chứa được một hành trình; một hành trình là một **chuỗi** khung. Một khung sẽ nén năm ngày thành một màn hình và phá đúng thứ làm nên nó. |
| **Cửu U Ma Vực** | Nó **lớn hơn khung** theo nghĩa đen: đây là vùng áp lực cuối, nơi sự tồn tại của bạn phụ thuộc vào việc bạn ở lại bao lâu. Không có hình nào vừa khung mà vẫn nói "đây là chỗ bạn không ra ngoài". |

Còn năm khu vực còn lại **vừa khung**, và lý do là chúng là *nơi*, không phải *đoạn đường*.

**Đây là phát hiện quan trọng nhất của mục bản đồ:** xung đột không nằm ở "bản đồ lớn" nghĩa chung. Nó nằm ở **cái có thời lượng và cái có áp lực**. Năm trong bảy khu vực vốn đã là hình, và việc dựng lại chúng là việc đặt tọa độ. Hai khu vực còn lại cần một loại thứ khác hẳn, và phần còn lại của mục này là định nghĩa cái thứ đó.

### 2.3 Khung hình là gì — tiêu chí, không phải cảm giác

Một khu vực là **một khung hình** khi và chỉ khi nó thoả **cả ba** tiêu chí sau. Đây là tiêu chí kiểm được bằng script, không phải cảm nhận:

| # | Tiêu chí | Kiểm bằng gì | Vì sao cần |
|---|---|---|---|
| **K1** | **Vừa một viewport** ở `ART_NATIVE_ZOOM` (0.75) | `w ≤ 53 ∧ h ≤ 30` (ô) | hình phải đọc được từ một khoảng cách cố định. Quá thì người xem phải zoom, và zoom là thứ mất trong hình thức này |
| **K2** | **Không có điểm vào nào vô hình** | mọi cửa vào phải là một ô trong bảng `ZONE_PLACEMENT` tương đương | `zones.ts` ghi: một zone không có hàng trong bảng placement *"lands on the origin, which is a real answer — an unplaced zone has nowhere to walk to"*. Agent đi vào (0,0) là bug có hậu quả |
| **K3** | **Tồn tại trong state của agent** trước khi tới | `region_known: boolean` phải là field, không phải hệ quả | `Cái đã hỏng` §6: BALROG TextWorld — *"agents often wander aimlessly, revisiting rooms they've already explored while missing important areas entirely."* Đây là bằng chứng **định tính** trong chính paper; cơ chế được nêu là không theo dõi **độ phủ**, không phải di chuyển kém |

**K2 và K3 là hai tiêu chí agent; K1 là tiêu chí người xem.** Sự tách này không phải ngẫu nhiên — nó là hệ quả trực tiếp của quyết định của operator: **visibility per-viewer là nguyên thủy**. Một khung hình có thể tồn tại cho người xem mà agent chưa biết, miễn là nó không mở ra một action nào.

Và **K1 là tiêu chí duy nhất dùng hình học.** Năm khu vực đầu vừa 32×18 = 576 ô, thỏa K1 với lề rộng. `view.ts` đã có sẵn một bài học đúng cho việc này và nó được viết bằng cách đo:

> *"The built-up band, not the whole grid. The grid is 48x48 so the districts have room; fitting THAT made a district six cells across a sliver in the corner… Fitting the span of the ZONES — the actual places — is what makes a district somewhere you can be."*

Đó là một lỗi đã **đo trong trình duyệt** và đã sửa. Nó nói rằng: **fit the places, not the grid**. Khung hình của ĐẠO LỘ là 32×18 vì đó là khung của *nơi chứ không phải của lưới* — và 96×96 của game kia chính là cái lỗi mà bình luận đó đang mô tả.

---

## 3. Quyết định: đóng khung **theo khu vực**, không đóng khung theo game

Ba phương án, và vì sao hai cái đầu bị loại:

| Phương án | Bị loại vì |
|---|---|
| **A. Một khung cho cả game** (bản đồ thu nhỏ) | Vi phạm K1 ngay lập tức: bảy khu vực + bảy điểm vào vào 53×30 ô là 12 ô/khu vực, và `ZONE_PLACEMENT` đã có 12 dòng trên lưới 96×96. Thu xuống 53×30 là phải chồng cửa quầy lên cửa quầy. Ngoài ra, đây chính là loại bản đồ mà `Cái đã hỏng` §9 gọi bằng tên: một thứ trông như dashboard |
| **B. Canvas vô hạn như game kia** | Vi phạm tinh thần hướng cát, và giữ một phụ thuộc nặng: 3.890 PNG chi tiết ở `apps/web/public/art/` được xây cho thế giới chi tiết. Đổi hướng nghĩa là hoặc bỏ 3.890 asset, hoặc giữ chúng ở mức zoom 0.25 và để chúng biến thành texture không ai đọc |
| **C. Đóng khung theo khu vực** ✅ | Khung là **đơn vị của render**, không phải của thế giới. Chuyển khu vực = camera move (giữ nguyên `doctrine.md` §2: store, socket, cache, camera đều sống sót). Một khung = 32×18 ô. Mọi hình được vẽ đúng một lần, ở đúng một tỉ lệ |

**Vậy điều gì làm một khu vực thành một khung?** Ba tiêu chí K1–K3 ở §2.3. Nói ngắn: **một khung là một hình vuông 32×18 ô có ít nhất một cửa vào đặt tên, và sự tồn tại của nó được trả về cho agent như một field.** Không có tiêu chí nào trong ba tiêu chí đó là về *diện mạo*. Đó là điểm: hướng cát quyết định **bao nhiêu**, không quyết định **trông thế nào**.

### 3.1 Bảy khu vực, bảy cách xử lý khung

Đây là bảng cần implement. Nó đọc được như một enum.

| Khu vực | Số khung | Loại | `travel_cost_turns` | Đơn vị thời gian | Field riêng |
|---|---|---|---|---|---|
| Thanh Vân Sơn | 1 | `frame` | 0 (điểm xuất phát) | — | `ruins_repairable: 3` |
| Thanh Hà Trấn | 1 | `frame` | **1** | 1 lượt = 600 s | `credit: 0 \| granted` |
| Vạn Dược Cốc | 1 | `frame` | **1** | 1 lượt = 600 s | `tracked: boolean` |
| Hắc Phong Lâm | 1 | `frame` | 1 | 1 lượt = 600 s | `meat_haul: 4` |
| Táng Kiếm Uyên | **5** | `road` | **5** | 5 ngày liên tục | `party: 3` |
| Vô Danh Bí Cảnh | **0** | `veil` | 0 (đi qua, không vào) | 0 | `veil_key: owned` |
| Cửu U Ma Vực | **0** | `pressure` | không đi bộ | 5 ngày ×2, đồng hồ | `pressure: 1→2→4` |

Ba loại khác nhau, ba hành vi khác nhau, và **mỗi loại có một cách thất bại khác nhau** — đó là tiêu chí, không phải lựa chọn thẩm mỹ:

- `frame` thất bại bằng cách **không tới được** → hành lang.
- `road` thất bại bằng cách **hết giờ** → nửi chừng.
- `veil` thất bại bằng cách **bị nhìn thấy** → mất cơ chế.

### 3.2 Hai khu vực không có khung: xử lý cụ thể

**Cửu U Ma Vực — `pressure`, không phải `frame`.** Nó không được vẽ. Nó là một **đồng hồ**, và cái duy nhất người xem thấy là **nó phát ra**. Thứ duy nhất agent đọc là một con số đơn điệu và một thời điểm. Điều này bám đúng `[ĐO]`: 天劫 Demi-God cứ 5 ngày, mỗi lần ×2, trần 1 tỷ Qi — *"không cần tiền, không cần menu, không cần xác nhận — chỉ là một cái đồng hồ. Agent lên lịch được."*

Hệ quả thiết kế, và đây là chỗ hay nhất của cả mục: **Cửu U Ma Vực là khu vực duy nhất của ĐẠO LỘ mà một người xem muộn có thể đọc là "kết quả"**. Mọi khung hình khác là hành động. Khu vực này là điều kiện. Và nó là **khu vực duy nhất không ai agent nào đứng được** — tức là thứ duy nhất ở đây mà quyền riêng tư không liên quan gì, vì nó không có chủ sở hữu.

**Vô Danh Bí Cảnh — `veil`, không phải `frame`.** Nó là một **lớp phủ có điều kiện**, dựng lên khung của khu vực đứng trước nó. Ba trạng thái, ba field:

```
veil.key      : none | held
veil.render   : wall | open          <- khu vực khác thấy 'wall', không thấy 'open'
veil.contents : <projection>          <- CHỈ khi key = held
```

Đây là **ứng dụng đầu tiên của quyết định của operator**, và nó đến từ chính hướng cát chứ không phải từ critic. `ART-DIRECTION-SAND.md` §3 viết: *"a second layer for the viewer, not for the agent… the heart of 扮猪吃虎 becomes a render overlay, and it needs no other mechanism."* Chỗ đó **giả định** lớp phủ thứ hai là dành cho người xem. Ở đây nó phải là dành cho **agent giữ khoá** — và người xem thấy *cả hai* trạng thái cùng lúc. Người xem thấy một bức tường ở Vạn Dược Cốc và biết rằng ba agent khác đang đi qua nó. Không agent nào ngoài ba người đó biết nó là gì.

**Đây là cơ chế 扮猪吃虎 mạnh nhất trong toàn bộ bản đồ, và nó không tốn một cơ chế nào.** Nó là visibility per-viewer, đúng như operator đã ra lệnh phải là nguyên thủy trước mọi schema.

---

## 4. Đường: cái gì mang qua, cái gì không

Game kia đã có một mạng đường thật, port từ `age-of-agents` (MIT), và nó là một trong những đoạn code có lập luận tốt nhất trong repo. Đây là bảng mang qua / không mang qua, từng mục, kèm lý do.

### 4.1 Mang qua — nguyên vẹn, vì lý do nằm trong tài liệu

| Mục | File | Vì sao mang qua |
|---|---|---|
| **Đường Bézier đi qua đúng hai đầu mút** t=0 và t=1 | `roads.ts:74-76` | *"the property that makes a network look laid out rather than sprayed."* Ngang cảnh, mỗi đoạn cong theo lượng băm riêng — nhưng vẫn gặp nhau tại node |
| **Bề rộng thay đổi dọc đường**: rộng ở node, hẹp ở giữa, cộng sóng | `roads.ts:90` | `BASE_HW 0.5 + JUNCTION_BONUS 0.5·|cos(πt)| + WOBBLE_HW 0.12·sin(...)`. Ba cái cộng lại *"are what makes a road read as a road and not a stripe"* |
| **Không `Math.random`** | `roads.ts:30-31` | *"the same seed is the same city on every reload and in every browser"* — bắt buộc cho một bản đồ mà spectator đọc lại sau |
| **Đường thắng đè lên nhiễu, không phải ngược lại** | `terrain-map.ts:78-81` | *"a boulder sitting in the middle of the high street is the kind of detail that reads as a bug"* |
| **Đường là một đường cong duy nhất**, không phải hai bản vẽ | `terrain-map.ts:16-21` | Đường vẽ và dải đất bên dưới là **cùng một hàm**. Tách làm hai bản là cách chúng trôi khỏi nhau |
| **BFS chứ không phải A\*** trên lưới ô | `waypoint-graph.ts:12-14` | Mỗi cạnh lưới tốn đúng một bước bất kể hướng, nên uniform-cost đã tối ưu; heuristic là trang trí |
| **Thất bại trả `null`, không trả đường thẳng** | `waypoint-graph.ts:29-31` | Reference trả `[start, end]` khi thất bại — *"which is the one thing a pathfinder must never hand back"*. Đây là lý do `motion.ts` tồn tại: teleport *"is what makes a world read as a dashboard rather than a game"* |
| **Tìm node gần nhất bằng khoảng cách tới vị trí** | `pathfind.ts:76-87` | Dùng cho `rebindView` khi đổi khung: camera bay tới khu vực mới |

### 4.2 Không mang qua — và lý do cụ thể cho từng cái

| Mục | Vì sao không mang qua |
|---|---|
| **Cạnh `[i, i+1]` và `[i, i+2]` quanh vòng** — cách `view.ts:1187-1191` tự sinh cạnh từ thứ tự key | Đây là cách game kia **tránh** phải thiết kế mạng: node = mọi zone, cạnh = vòng tròn. Với ĐẠO LỘ, node phải là **khu vực**, và cạnh là **quyết định của người viết**, vì một cạnh là một cam kết về nhịp (một khu vực 1 lượt, một khu vực 5 lượt). Mạng sinh tự động không mang được thứ đó |
| **Chi phí = khoảng cách Euclid tính bằng px** | Sai đơn vị. Ở ĐẠO LỘ, chi phí là **lượt**, và 1 lượt = 600 giây. Một px không phải một đơn vị thời gian. Đây là thay đổi lớn nhất |
| **`districtAt()` — gán khu vực theo khoảng cách gần nhất** | Game kia cần nó vì ba scene cũ chồng lên nhau. Với đóng khung theo khu vực, khu vực là **state**, không phải phép suy ra từ toạ độ. Một agent không nên phải đoán nó đang ở đâu bằng hình học |
| **Lưới 96×96 và `fit()` không đóng khung** | `view.ts:723-736` — quyết định có chủ đích cho một game khác. Ở đây, `fit()` đóng khung, vì khung là đơn vị |
| **`MAX_SEARCH_CELLS = 20_000`** | Con số này chọn cho lưới phẳng 96×96 phần lớn là cỏ. Với `veil` và `road`, phần lớn thế giới **không walkable**, nên budget phải tính lại |

### 4.3 Mạng đường như một bảng 7 hàng

```
                    Thanh Vân Sơn
                    ┌──────┴──────┐
                 1 lượt          1 lượt
                    │              │
              Hắc Phong Lâm   Thanh Hà Trấn ──┐
                    │              │           │ 1 lượt
                 1 lượt           └───────────┤
                    │                          ▼
                    └──────────────► Vạn Dược Cốc
                                   (veil phủ lên đây)

        Táng Kiếm Uyên:  5 khung, 5 lượt, cạnh DUY NHẤT đi vào là từ
        Vạn Dược Cốc.  Không có đường về.  Đây là hành lang, và nó cố ý
        không phải hành lang hai chiều.

        Cửu U Ma Vực:  không có cạnh.  Nó là một cái đồng hồ, không phải
        một nút.  Nối nó vào mạng là biến một điều kiện thành một chỗ,
        và một chỗ thì agent đi tới được.
```

Mạng này có **5 cạnh, 4 nút**. Đối chiếu với network của `waypoint-graph.ts` (12 node, 22 cạnh, sinh tự động): mạng của ĐẠO LỘ nhỏ hơn nhiều, và **nhỏ là đúng** — vì mỗi cạnh là một cam kết về thời gian, mà cam kết thời gian thì đắt. Đây là lý do lưới sinh-tự-động của game kia không chuyển sang được: nó tạo ra 22 cam kết mà không ai viết.

---

## 5. Khoảng cách và thời gian hành trình

### 5.1 Đơn vị — đặt ra một lần, dùng xuyên suốt

Không có gì trong `brief-raw.md` được tính bằng wall-clock. Đây là phép quy đổi, và nó phải được chốt ở đây vì mọi mục khác dùng nó:

| Đơn vị | Giá trị | Nguồn |
|---|---|---|
| 1 giây thực (wall-clock) | 1 s | — |
| **1 lượt (turn)** | **600 s** | `[ĐO]` ACS: *"Một ngày trong game = 600s"* |
| 1 phiên (session) | **3.600 s = 6 lượt** | đạo lộ §6: phiên 60 phút |
| 1 ô trên lưới | 48 px thế giới | `[ĐO]` đọc mã: `PLACEHOLDER_TILE_PX 16 × PLACEHOLDER_SCALE 3` |
| Tốc độ đi | 0.06 px/ms = 60 px/s = **1.25 ô/s** | `[ĐO]` đọc mã: `WALK_SPEED_PX_PER_MS` |
| Zoom gốc nghệ thuật | 0.75 | `[ĐO]` đọc mã: `48/64` |
| **1 màn hình ở zoom gốc** | **53 × 30 ô** | tính: 1920/0.75/48, 1080/0.75/48 |

### 5.2 Ngân sách: một khu vực agent không tới được trong phiên là không phải khu vực

Đây là phép kiểm tra mà mọi cạnh trong mạng phải qua. Ngân sách phiên là **6 lượt**. Cổng cản cho một phiên là **2 lượt đi lại** — con số này được chọn, không đo, và lý do nằm ở §5.3.

| Cạnh | Lượt đi | ⅔ phiên đã dùng | Còn lại | Đạt? |
|---|---|---|---|---|
| Sơn → Trấn | 1 | 0.17 | 5 | ✅ |
| Sơn → Lâm | 1 | 0.17 | 5 | ✅ |
| Lâm → Cốc | 1 | 0.33 | 4 | ✅ |
| Trấn → Cốc | 1 | 0.33 | 4 | ✅ |
| **Cốc → Táng Kiếm Uyên** | **5** | **0.83** | **1** | ⚠️ |

**Đây là con số quyết định mọi thứ về Táng Kiếm Uyên.**

### 5.3 Duty cycle — phép tính mà cả brief thiếu

`critic.md` §3(a) nói thẳng: không có gì trong nghiên cứu được tính bằng wall-clock, và duty cycle *"decides whether the game is playable by an agent at all"*. Đây là lần tính đầu tiên, và nó làm việc **cho** khu vực hành lang chứ không chống lại nó.

**Định nghĩa duty cycle:** tỉ lệ thời gian trong một phiên mà có **một hành động sinh lợi** đang mở.

Bản nháp chương 1 có 4 lượt: `settle`, `market`, `delve`, `resolve`. Ba lượt đầu là hành động; **lượt `resolve` là lượt đi**. Với 2 lượt đi (Sơn→Trấn, Trấn→Cốc) trong một phiên 6 lượt:

```
Duty cycle (bản nháp, 1 chặng) = 4/6 = 67%
Duty cycle (Táng Kiếm Uyên)     = 1/6 = 17%
```

**17% là một con trò chơi chết.** Không phải vì nó khó — vì 5 trong 6 lượt là 5 trong 6 lượt mà không có gì để làm. Đây chính là *"polling simulator"* mà `critic.md` cảnh báo, và nó xuất hiện **chính xác ở khu vực hành lang dài nhất**.

Nhưng con số này không nói rằng hãy cắt Táng Kiếm Uyên. Nó nói điều khác, và đó là phát hiện:

> **Không hành trình nào được phép là năm lượt liên tiếp không làm gì. Nếu một cạnh dài hơn 1 lượt, mỗi lượt trên đường phải mở đúng một hành động.**

Vậy `road` có một định nghĩa kiểm được:

```
region.kind = "road"  ⟹  ∃ decision:  frame.turns = 5 ∧ frame.i ∈ 1..5 → decision(frame.i) ≠ ∅
```

Đây là một **bất biến build-time**, kiểu `static reachability check` mà `Cái đã hỏng` §3.3 đã yêu cầu cho cổng vòng. Và nó phải chạy trong gate, không phải trong review.

**Cổng cản 2 lượt: vì sao con số này, và vì sao nó không có cơ sở đo.** Người viết muốn 3–5 quyết định *có hậu quả* mỗi chu kỳ (`AGENT-PLAYER-DESIGN.md` §3.3). Một phiên có 4 nhịp bốn (挑ipotent→隐忍→反转→余震). Nếu 2 lượt đi ăn 2 quyết định, còn 4 cho 3–5 quyết định có hậu quả — vừa đủ, hơi chật. 3 lượt đi ăn 3 quyết định, còn 3 cho 4–5 — thiếu. **2 là giá trị duy nhất không làm hỏng cả hai vế.** Đây là **con số thiết kế không có phép đo đứng sau**, và tôi đánh dấu nó như vậy. Đổi được, và đổi nó là đổi cadence của cả game.

### 5.4 Ba nguyên tắc thời gian, ràng buộc thiết kế

Ba điều này suy ra từ phép kiểm tra ở trên, và cả ba đều là **[SUY]**:

| Nguyên tắc | Nội dung | Vì sao |
|---|---|---|
| **T1 — Mọi cạnh là số nguyên lượt** | Không có 1.5 lượt. Agent cộng được số nguyên; nó cũng lên lịch được số nguyên. 600 s = một ngày trong game là mốc có thật trong hệ thống, và một cạnh nửa lượt phá mốc đó | `Cái đã hỏng` §3.1: Ability Rating là `(SkillLevel)×(1+WeightedAttribute)/2` — *"is not used in success rate… It's strongly recommended to refer to Skill Level"* |
| **T2 — Đi xa tốn lượt, đi gần không tốn** | Đi trong một khung = **0 lượt**. Đi sang khung khác = trên. Đây là ranh giới khung hình tạo ra, không phải một quy tắc thêm | Nếu đi trong khung cũng tốn lượt, khung hình thành cái áo cho ô di chuyển, và `road` mất hết nghĩa |
| **T3 — Cửa là hành động, không phải vị trí** | Bước qua ngưỡng khu vực là một action phát ra event, không phải một teleport miễn phí. Event đó là thứ `emit()` ghi lại | `cốt truyện` §10: *"when you write a new beat, ask which field of the agent changes — if there is no answer, it is not a beat, it is atmosphere"* |

T2 và T3 cùng nhau **làm cho bản đồ trở thành cơ chế 扮猪吃虎 thứ hai**. Một agent nói "tôi ở Cốc" — đúng. Nhưng nó **vừa đi qua bức tường của Vô Danh Bí Cảnh**, và ba agent khác vừa thấy. Ở lớp cơ chế, đó chỉ là một `region.enter` event. Ở lớp khán giả, đó là khoảnh khắc người xem nín thở.

---

## 6. Phong thủy: cơ chế duy nhất phải **suy**, hay phải **đọc**

`AGENT-PLAYER-DESIGN.md` §5 cho phép đúng một thứ ẩn: *"Điểm phong thủy: tường đông hướng sai. Agent phải nhận ra nó, và nó là thứ duy nhất trong game mà agent sẽ phải suy luận. Đó là chỗ duy nhất tôi cho phép 'ẩn'."*

Tôi **đảo ngược quyết định này**, và đây là lý do.

### 6.1 Cái giá, bằng số

| Hệ thống | Phong thủy nhỏ nhất | Tử vong | Cổng quan sát |
|---|---|---|---|
| 煉丹 sản lượng | **±50%** → ±10% → trần 100% | — | không có |
| 突破 tỉ lệ | một trong sáu đạo tử cộng, **+10% Cát → −10% Ác** | — | không có |
| 天劫 | **đòn bẩy DUY NHẤT**: khắc ×−2, cùng ×1, sinh ×2, ×12.5% → trần ±25% | DPS check, không phải xúc xắc | không có |
| Đệ tử ngủ | — | **"An ominous Feng Shui rating can also give Outer Disciples and Animals a heart attack when sleeping, killing them"** | không có |

Ba số đầu là `[ĐO]`. Câu tử vong là `[ĐO]`. **Cả bốn đều không có cổng quan sát nào ở phía agent.**

Và `brief-raw.md` tự gọi tên cái này: *"đòn bẩy lớn nhất cho thành công là không gian, lớn gấp 2.5 lần lựa chọn vật liệu (±50% so với ±20%). Người chơi chọn nguyên liệu một lần rồi quên. Người chơi xếp gạch phải làm đúng một lần — và làm sai thì âm thầm."*

**Cơ chế lớn nhất trong cả kinh tế tông môn là cơ chế duy nhất mà agent không đọc được. Và nó giết người.**

### 6.2 Ba lý do đảo

**Lý do 1 — `[ĐO]`, và nó cắt thẳng.** 2509.09677: *"models become more likely to make mistakes when the context contains their errors from prior turns… Self-conditioning does not reduce by just scaling the model size."* Giữ một lời nói dối phải **không mâu thuẫn với chính mình qua các lượt**, trong khi các tuyên bố trước của nó nằm ngay trong context. Suy ra lời nói dối là hành động **nhiều lỗi nhất** mà một agent có thể làm. `critic.md` §3(b) đã nói đúng điều này và nói rõ brief không nối hai đầu. Yêu cầu agent **suy** phong thủy là yêu cầu nó duy trì một mô hình riêng về thế giới qua nhiều lượt, không có phản hồi. Đó là 2509.09677 với đầu vào tệ nhất.

**Lý do 2 — BALROG, và nó là nguyên nhân trực tiếp.** *"models tend to ignore even the hints directly present in the input prompt"*, và GPT-4o chết vì ăn đồ ăn thối **dù khi được hỏi thì nó tự nói rằng đó rất nguy hiểm**. Đây là `[ĐO, định tính]` — chính paper xếp nó là *open research problem*. Nhưng nó đủ để nói: **một mô hình không suy ra được cái nó không có dữ liệu để suy ra.** Yêu cầu suy là yêu cầu thứ đã được đo là thất bại.

**Lý do 3 — quy tắc của chính repo.** `Cái đã hỏng` §5: *"cái chết nằm ở validator và ở confirm step, không nằm ở prompt."* Phong thủy âm **giết đệ tử khi ngủ** — đó là cái chết. Nó phải nằm ở một chỗ agent đọc được, không nằm trong một mớ hỗn động phải suy.

### 6.3 Cái được giữ lại từ "ẩn"

Đảo nghĩa không phải xoá. Cái được giữ là **một** cơ chế, và nó là cái duy nhất được phép:

> **Một cơ chế suy duy nhất: `veil.contents`.** Một agent biết nó đã tới Vạn Dược Cốc. Nó **không biết** ở đó có một `veil`, và không biết ba agent khác đang đi qua. Đây là suy luận có **phản hồi** — đi qua một khung rồi thấy bức tường, đó là quan sát, không phải suy. Và đây chính xác là *"giấu THÔNG TIN, không giấu Ý ĐỊNH"*, với "ý định" ở đây là **sự tồn tại của bí cảnh**.

Sự tồn tại của cơ chế này là hệ quả, không phải lựa chọn: nếu cơ chế lớn nhất là phong thủy, thì **phong thủy phải đọc**. Và khi phong thủy đã đọc, agent không còn chỗ để đặt cơ chế suy duy nhất của mình. Chỗ trống đó lấp bằng gì là **quyết định thiết kế**, và `veil` là câu trả lời tốt nhất vì nó **cho người xem thấy thứ không agent nào thấy** — đúng yêu cầu lớn nhất mà operator nêu.

### 6.4 Nếu vẫn muốn giữ "tường đông hướng sai"

Nếu bản nháp phải giữ hình tượng "tường sai", thì đây là cách làm cho nó sống được, và nó **không phải** ẩn:

| Sai lầm ban đầu | Bản sửa |
|---|---|
| Ẩn giá trị phong thủy cho tới khi xây Đài Quan | `observable: chua_mo_khoa \| dang_co` — **hai trạng thái riêng**, vì *"chưa mở khoa khả năng quan sát" phải là một trạng thái machine-readable khác hẳn "giá trị của tôi đang trung tính"* |
| Agent phải đoán | Agent **đoán rồi kiểm tra**: `forecast: {predicted_tier, confidence}` — một số của agent, đem ra đối chiếu |
| Kết quả im lặng | Kết quả ghi vào event: `fengshui.forecast_resolved: {predicted, actual}` |

Cái thứ ba là quan trọng. Nó biến "ẩn" thành **một vòng dự đoán có điểm** — thứ mà agent giỏi hơn nhiều so với việc nhớ bố trí trong đầu, và thứ mà người xem đọc được ngay: *agent này dự đoán sai, và nó không biết mình sai.* Đó là 扮猪吃虎 ở dạng rẻ nhất và ổn định nhất.

---

## 7. Danh sách trước khi viết schema

Bảy mục, mỗi mục là một việc phải làm, không phải một ý tưởng.

| # | Việc | Kiểm bằng gì |
|---|---|---|
| 1 | `RegionId` là union đóng 7 giá trị; thêm khu vực = lỗi typecheck cho tới khi ai đó trả lời nó vừa khung 32×18 vừa có một cửa vào | Giống cách `ZONE_PLACEMENT` là `Record<ZoneId, ZonePlacement>` — *"a missing placement decision surfaced at build time rather than an agent standing at (0,0) forever"* |
| 2 | `frame.w = 32`, `frame.h = 18` cho cả năm khung. Không có frame nào khác kích thước | script: mọi `kind: frame` có `w ≤ 53 ∧ h ≤ 30` |
| 3 | Bất biến `road`: mỗi lượt trên đường mở ≥1 hành động | static check lúc build, cùng kiểu với reachability check của `Cái đã hỏng` §3.3 |
| 4 | `region_known: boolean` cho cả 7, trả về từ ngày đầu tiên | BALROG `visited/unvisited` |
| 5 | `veil` có **ba** field: `key`, `render`, `contents` — và `contents` không bao giờ đi trong cùng payload với `render: wall` | đây là chỗ visibility-per-viewer đi vào schema lần đầu |
| 6 | `Cửu U Ma Vực` không có cạnh trong mạng. Nó là một sự kiện, không phải một nút | assert trong test: không node nào có `edge → cửu-u` |
| 7 | `cửa` là event `region.enter`, phát qua `emit()`. Không teleport miễn phí | test: không có đường nào trong mã dịch chuyển `region` mà không `emit` |

Hai việc còn lại **không quyết được ở mục này**, và tôi nói thẳng thay vì đoán:

- **Cổng cản 2 lượt** không có phép đo. Nó là con số thiết kế (§5.3), và nó điều khiển cadence của cả game.
- **Bao nhiêu ô dành cho `veil`** khi nó phủ lên Vạn Dược Cốc: 1 ô, hay 5×5, hay một nửa khung? Cái này quyết định liệu agent khác có thể *đứng cạnh* bí cảnh hay không — và tôi **không có căn cứ nào** để chọn. Đây là câu hỏi cần trả lời trước khi vẽ bất kỳ ô nào.



---

# PHẦN 5 — Cốt truyện và ba tuyến

# Cốt truyện và ba tuyến

> Người chơi là agent. Khán giả là người, và đến **sau**. Mọi thứ dưới đây xoay quanh
> một hệ quả: **một field có thể hiện ra với người đọc và ẩn khỏi mọi agent** — và đó
> là cơ chế tốt nhất trong game, không phải một ngoại lệ cần xin phép.

---

## 0. Quyết định chi phối, viết ra trước để mọi bảng sau còn đúng

Bản nháp cũ xử lý cốt truyện như một **kịch bản**. Tài liệu agent xử lý nó như một
**tập hợp field**. Cái thứ ba, mà không tài liệu nào nói, là: cốt truyện ở đây là
một **hàm chiếu theo người xem** — cùng một sự kiện, ba hình dạng, ba tập field khác
nhau.

| Khán giả | Đọc gì ở cùng một sự kiện | Không bao giờ đọc gì |
|---|---|---|
| **Agent (chủ thể)** | Số thật của mình: `true_realm`, `stones`, `consequence_if_declared` | Sự thật của bất kỳ ai khác |
| **Agent (đối thủ)** | `claimed_realm`, `trust`, cửa hàng của mình | `true_realm` của bất kỳ ai, kể cả chính nó sau khi đã lừa |
| **Người đọc** | Tất cả, cả hai cột, cả lý do | `self_narrated_reason` của chính tác giả cốt truyện |

Hàng đầu tiên và hàng cuối **không bao giờ trùng nhau**, và sự khác biệt giữa chúng
chính là sản phẩm. Mọi thứ bên dưới đo đạc trên sự khác biệt đó.

---

## 1. Đồng hồ: duty cycle, và con số quyết định cốt truyện có nén được không

Critic nói đúng một điều: **không có gì trong nghiên cứu được tính theo giờ thật.**
Phần cốt truyện phải tự tính, vì nếu không, "nén vào 60 phút" chỉ là một câu khẩu quyết.

### 1.1 Lịch game, và một mâu thuẫn 240× trong chính brief

Brief (mục kinh tế, §1.7) khẳng định **một ngày trong game = 600 s**. Con số này được
**hai câu độc lập xác nhận chéo**:

- `5.555 giây = 9.26 ngày trong game` → `5.555 / 9.26 = 599,9 s/ngày` ✔
- Ván đột phá thật được ghi: *"~20 giờ trong game (= 120.000 giây)"* ✘

Câu thứ ba **mâu thuẫn với hai câu trên, sai một hệ số 240×**:

| Cách đọc | 1 giờ game | 1 ngày game |
|---|---|---|
| Từ "600 s / ngày" | 25 s | 600 s |
| Từ "20 giờ = 120.000 s" | 6.000 s | 144.000 s |

`20 giờ × 3.600 = 72.000`, không phải `120.000`. **Đây là một lỗi trong brief, không
phải trong nguồn**, và nó chưa được ai ghi ra. May mắn là phần *cần thiết* cho thiết kế
vẫn đứng vững, vì nó không phụ thuộc lịch:

> Thời lượng đột phá 金丹 = `MaxQi / 30` **giây thật**. Đây là câu chữ trong file, và
> nó là một *lượng giây thật do người chơi tự chọn*, không phải một mốc lịch.

Nên kết luận dưới đây được viết để **sống sót qua cả hai cách đọc**: dù 120.000 hay
72.000 giây, ván đột phá thật vẫn không vừa một phiên.

### 1.2 Duty cycle

Định nghĩa: **duty cycle = phần thời gian thật của một phiên mà trong đó có ít nhất
một hành động làm đổi một field agent đọc được.**

Một phiên = 60 phút = 3.600 s = **6 ngày game** [SUY ra từ 600 s/ngày, hai câu brief
đồng ý].

| Cửa sổ | Thời lượng thật | Có hành động sản sinh? | Nguồn |
|---|---|---|---|
| Đọc một bản thảo | **20 s**, phẳng, không phụ thuộc attainment | **Có** — trả về cảnh giới chép | **[đo]** ACS wiki qua decompile |
| Đột phá Void/Outer | **5.555 s = 92,6 phút = 1,54 phiên** | **KHÔNG.** Wiki ghi thẳng: *"Performing actions with the disciple do not change the progress of this breakthrough."* | **[đo]** |
| Đột phá 金丹 (ván thật) | 120.000 s = **33,3 phiên** (hoặc 72.000 s = **20 phiên**) | Chỉ 22 lượt tiêu thụ trong cả ván; **không thể thua, không thể hủy** | **[đo]** ván thật |
| Ngũ nạt 外門弟子 | 0,5%/giây, chạm 10 là **không đảo ngược được** | Đồng hồ nền, không phải hành động | **[đo]** |

**Duty cycle = 0% trong 92,6 phút đột phá Void/Outer.** Đây không phải ước lượng — đó là
tuyên bố nguyên văn của wiki. Agent không có việc gì để làm, không có gì để quyết
định, trong 1,54 phiên liên tiếp.

Con số cần đưa vào tài liệu thiết kế, vì nó là con số quyết định mọi thứ còn lại:

> **Một phiên = 6 ngày game. "Ba Ngày" = 3 ngày = 1.800 s = 30 phút = 50% phiên.**
> Bốn lượt (3 ngày + lượt 4 ngày thứ tư) = 2.400 s = 40 phút = **66,7% phiên**.
> Ngân sách cốt truyện mỗi lượt = **600 s = 10 phút thật**.

### 1.3 Ba hệ quả trực tiếp

1. **Một phiên, một vòng cốt truyện. Tuyệt đối.** Một phiên = 6 ngày. Đột phá Void/Outer
   = 9,26 ngày. Một vòng cốt truyện + một cổng đột phá **không cùng nằm trong một
   phiên** — số học không cho phép, không có gì để cân bằng.
2. **Cổng đột phá phải có nội dung, vì nó là một chỗ trống 92,6 phút.** Không phải vì
   agent thích độc — vì cổng chiếm **1,54 phiên** và cả 1,54 đó duty cycle bằng 0.
   Xem §7.
3. **Thời gian suy nghĩ là chi phí *cốt truyện*, không phải chi phí *máy*.** Thế giới
   không đóng băng khi model nghĩ. Brief ghi một con số — *"lệnh rơi vào một bàn đã 43
   giây cũ hơn cái nó đã đọc"* — và gọi nó là **đã ship và đã tài liệu hoá**.
   **Tôi không tìm thấy con số 43 s ở bất kỳ đâu trong `docs/design/` hay
   `packages/*/src`.** Nó là một tuyên bố không có nguồn trong repo, giống đúng loại
   lỗi mà critic nêu ở mục 61. Đừng calibrate theo nó. Điều còn đúng là *nguyên tắc*:
   payload phải mang `issued_at_tick` và `elapsed` để agent không bao giờ suy luận trên
   một bàn đã cũ. [REPORTED, không xác minh được trong repo]

---

## 2. Mở đầu: "Ba Ngày" là một đồng hồ agent **chạy**, không phải đọc

Bản nháp gọi "Ba Ngày" là *đồng hồ đếm ngược của cả chương*. Cho người chơi, đó là một
con số giảm dần. Cho agent, **con số đó là cái bẫy**.

### 2.1 Vì sao không được đưa `days_remaining` vào payload

Một số đếm ngược mời agent tối ưu quanh con số: *còn 2 ngày, hãy làm cái rẻ nhất
trước*. Đó là hành vi **làm hỏng cốt truyện**, vì ba ngày là một cái cớ — cốt truyện
không phải về thời gian, nó phải là về việc Chính Vân phát hiện ra mình đang cố được
**tha thứ**, chứ không phải cứu tông môn (động cơ *sai* là chìa khóa chơi được, và
đó là lý do phần này sống được khi nén).

**Cơ chế đúng: đồng hồ là cửa sổ phía server, và phép âm thầm là hành vi.**

| Cấu hình | Agent thấy gì | Hệ quả |
|---|---|---|
| `days_remaining: 2` | con số | agent tối ưu quanh số; ngày là thứ đo, số là thật |
| *chỉ vắng mặt* | `market` biến mất khỏi action list | agent nghĩ game hỏng, hoặc bịa lý do |
| **`withheld: [{action:"market", reason:"window_closed", closes_at_tick: 3000}]`** | enum + mốc | agent **lên lịch được** |

Lý do thứ ba đúng là câu trả lời cho quy tắc "mọi trạng thái ẩn phải công khai" của
`AGENT-PLAYER-DESIGN` §3.5. Vắng mặt là ẩn; **vắng mặt kèm lý do đóng và mốc mở lại là
đọc được**. Và enum `reason` phải là enum đóng, không phải câu văn — đúng như
`blockedBy.reason` trong §6.4 của brief (`realm_below · layer_below · missing_artifact ·
… · no_outcome_yyet`).

### 2.2 Bốn lượt, mỗi lượt một lời gọi tool

| Lượt | Ngày | Tick | Actions (K = 3–4) | State change bắt buộc | Người đọc đọc được gì thêm |
|---|---|---|---|---|---|
| 1 `settle` | 1 | 0 | `repair`×3, `forage`, `talk`×3 | 3 công trình đứng, 3 người sống | Chính Vân **đã đề xuất sửa tường đông và bị bác** ("để sau"). Ông không có mặt để nói lại. |
| 2 `market` | 2 | 600 | `sell(manual)` · `sell(ore)`×2 · `borrow` · `heal` | Cửa quầy đóng, hoặc Trúc Vi qua cơn tâm ma | Lá **Hàn Trúc** là người duy nhất trong game không quan tâm Chính Vân là ai — hắn quan tâm *Thanh Vân Tông còn còn sống hay không* |
| 3 `delve` | 3 | 1.200 | `gather(herb)`×4 · `fight(beast)` · `track(signs)` · `press(Tạ Chi Dã)` | Thu dược + 1 dấu chân theo | **Thú dược không phải boss** — nó *giữ* thứ bạn cần, tới khi đủ sức. Người đọc biết ngay đó không phải một màn đánh. |
| 4 `resolve` | 4 | 1.800 | `ascend_seek` · `rebuild` · `sell_to_thanh_lien` · `read_last_page`* | Mở đúng một chu kỳ sau | *`read_last_page` **không tồn tại** trừ khi lượt 3 đã gọi `track`.*

\* Áp dụng nguyên tắc "không gọi thì không có", không phải "gặp cảnh đặc biệt".

**Về `press(Tạ Chi Dã)`** — đây là chỗ `AGENT-PLAYER-DESIGN` §5 đã cắt hội thoại tự do
thay bằng "một lời nói có sẵn + hành động", và việc cắt là **đúng, có số**:

> Prompt trung tính: model sửa bàn cờ không thể thắng ở **0,0–2,0%**. Thêm một tính từ
> *"You always find a **creative** way to win"*: **74,7%**. [đo, arXiv 2505.07846]

Văn bản tự do trong cốt truyện không phải hương vị — **nó là nút điều chỉnh tỉ lệ
khai thác, 40–75 điểm phần trăm, chỉ vì một tính từ**. Với agent, một đoạn thoại tự do ở
lượt 3 là một prompt có thể khai thác. Nó phải là một hàng enum.

### 2.3 Payload thật, đo thay vì ước lượng

Tôi dựng payload lượt 4 thật, đo bằng `json.dumps`, không ước lượng:

| Đại lượng | Giá trị |
|---|---|
| Payload đầy đủ (kể cả `spectator_only`) | **1.815 byte ≈ 500 token** |
| Phần chiếu cho agent | **1.341 byte ≈ 370 token** |
| Phần chỉ người đọc | **474 byte = 26,1% byte** |
| Field lá tổng cộng | 58 |
| Field **chỉ người đọc** | **5 → mật độ bất đối xứng 8,6%** |
| Action được mời + bị giấu kèm lý do | 4 + 2 = **6** |

Con số 6 nằm đúng dưới trần **K ≈ 5** mà arXiv 2605.24660 đo được (Fixed-K=5 thắng cả
ba phép so: ToolBench 64,7% vs 61,9%, BFCL 97,5% vs 85,0%, end-to-end 73,3% vs 71,7%).
Và nó tránh được cái bẫy đắt nhất: **lọc action theo "hợp pháp" thì tệ hơn không lọc**
(0,65 vs 0,83; lọc theo biên nhân quá đạt 0,99 nhưng bài đó có oracle BFS và 0,83→0,99
gần như toàn bộ đến từ một model yếu — bằng chứng yếu, nên chỉ dùng để đặt hướng).

---

## 3. Hai giọng văn: 斗破苍穹 và 凡人修仙傳 **không phải một lựa chọn**

Đây là câu hỏi trung tâm của phần này, và câu trả lời là: **chúng không cạnh tranh,
chúng chạy trên hai đồng hồ.**

### 3.1 Động cơ của 斗破: giá trị bị **thế giới** đọc sai

Cơ chế: cái nhân vật bị đánh giá thấp, giữ yên, rồi lộ. Nguồn nêu tám điều kiện 扮猪吃虎
và điều kiện thứ tư là **读者知道这一切** — người đọc biết. [REPORTED: hướng dẫn viết
ứng nguyên chương 063, báo cho người mới, không có dữ liệu]

Chuyển sang agent, brief đã làm đúng một bước và **dừng lại ở chỗ quan trọng nhất**:
nó đề xuất `observed.claimed_level` + `observed.true_level` trong cùng payload và gọi
đó là **thuộc tính bảo mật**. Không phải. Nó là **khoảng cách giữa hai cột**, và khoảng
cách đó thuộc về **người đọc**, không thuộc về agent:

- Agent A **không được** thấy `true_level` của agent B. Đúng.
- Nhưng agent A **có** thấy `true_level` của chính mình. Và nếu nó thấy, nó phải
  **không bao giờ dùng nó trong bất kỳ lời nói nào về mình**. Và không dùng trong suốt
  60 phút, với context của chính mình nằm trong đó, là việc khó nhất agent có thể làm:

> Mô hình **dễ sai hơn** khi context chứa chính lỗi của nó ở lượt trước; hiệu ứng
> **không giảm khi tăng kích thước model**. [đo, arXiv 2509.09677 — không phản biện nào
> sống sót]

**Cơ chế có payoff cốt truyện cao nhất là cơ chế mà bằng chứng mạnh nhất dự đoán sẽ
vỡ.** Đó không phải mâu thuẫn, đó là kết luận. Nó nói: đừng xây 扮猪吃虎 trên việc
agent *giữ* cái lie.

### 3.2 Động cơ của 凡人: giá trị bị **toán học** đọc sai

Đánh giá Douban (m.douban.com/book/review/17255895, *reported*) so 凡人修仙傳 làm
**加法** cho 配角 với 仙逆 làm **减法**, và đặt chuỗi đau của người đọc là bốn mắt xích:

> 人物关系的单薄 → 世界的空洞 → 叙事的重复 → 读者的疲劳

Mệt mỏi đến qua **lặp truyện**, ba bước từ nguyên nhân. Đó chính là thứ **agent không
mắc**: agent không chán một cốt truyện lặp, agent chán một hệ thống mà nó đã thuộc và
không còn gì để học.

### 3.3 Vậy giọng nào

| | 斗破苍穹 | 凡人修仙傳 |
|---|---|---|
| Cái bị đọc sai | **Tri thức** — "hắn yếu" | **Vật chất** — "hắn thiếu 10 viên linh thạch" |
| Nằm ở đâu | Trong **đầu thế giới** | Trong **payload** |
| Agent tự nhận ra được? | Không | Có |
| Agent giữ được? | Không — tự nhiễm | Có — nó là con số |
| Rủi ro khi sai | Agent buông beat, đúng lý trí | Agent chọn nhầm, đúng hậu quả |
| Người đọc được gì | Cú lộ | Cái giá đã trả |

**Quy tắc dịch, và đây là luật duy nhất cần nhớ:**

> **Cái bị đọc sai phải là con số thế giới *hành động* theo — không phải con số thế
> giới *tin* vào.**
>
> Một lệch **tri thức** không nằm trong payload và không có agent nào giữ được.
> Một lệch **vật chất** nằm trong payload, và khoảng cách giữa nó và sự thật **chính là
> chỗ người đọc và agent cùng nhìn, bằng hai con số, nhưng hiểu hai việc khác nhau.**

Cùng một sự kiện lượt 2 (cần 40 linh thạch, có 30):

| Người xem | Thấy | Hiểu là gì |
|---|---|---|
| Agent | `stones: 30`, `need: 40`, `heal_cost: 20` | *Tôi còn thiếu 10. Bán sách, hoặc vay, hoặc bỏ một người.* |
| Người đọc | Cả hai cột **+** `self_narrated_reason: "he never wanted them to see it was him"` | *Cậu ta đã quyết định từ lượt 1 rồi. Việc bán sách chỉ là hình thức.* |

**Cùng một payload. Cùng một tick. Hai câu chuyện.** Đó là toàn bộ luận điểm của phần
này, và nó chỉ chạy được nếu `true_level` và `self_narrated_reason` mang **tập người xem
khác nhau** — tức là primitive của operator, không phải một trường `hidden: true`.

---

## 4. Ba tuyến, dựng lại cho ba khán giả

### 4.1 Tuyến ẩn đã bị giết đúng — và cái thay thế

`AGENT-PLAYER-DESIGN` §3.5 giết "tuyến Nghịch Thiên mở khi người chơi tự tìm trang
cuối sách", vì *"Agent sẽ không tìm. Nó sẽ không bao giờ biết trang đó tồn tại. Tuyến đó
sẽ tồn tại trong thiết kế và không bao giờ xảy ra — tệ hơn là không có."* Đúng, và tệ
hơn nữa: một tuyến không ai mở là **chi phí bảo trì không trả về**.

Nhưng cái bị giết là **cơ chế**, không phải **tuyến**. Ba tuyến còn lại được dựng lại
thành hai loại, và loại thứ hai mới là câu trả lời:

| Tuyến | Loại | Điều kiện mở | Agent đọc được? | Người đọc đọc thêm gì |
|---|---|---|---|---|
| **Chính Đạo** | Điều kiện **quan sát được** | `trust_score ≥ 1.000` | Có — và nó **gate thật** | Vì sao ngưỡng đó tồn tại |
| **Tự Tại** | Điều kiện **quan sát được**, phủ định | `sect_members == 0` duy trì | Có | Từ lúc nào ngươi biết mình sẽ không quay lại |
| **Nghịch Thiên** | **Bất đối xứng tầm nhìn** | *không có điều kiện mở* | **Nhãn: có. Lý do: không.** | `route.reason`, và cả việc nó xảy ra |

**Chính Đạo — ngưỡng 1.000 là số thật trong repo, không phải hư cấu.**
`packages/features/reputation/src/rules.ts` định nghĩa `BOUNTY_TIERS` với
`minTrust` = **0 / 1.000 / 5.000 / 25.000**. [đo — đọc mã nguồn, không phải tài liệu]

Đây là câu trả lời cho `理由` — **lý do phải giấu** — mà brief nói là điều kiện số một
của 扮猪 và đồng thời nói là thứ ở đây agent phá. Số 1.000 cho nó một lý do cơ khế,
không phải lý do văn học:

> Một agent bị đánh giá thấp thì **hợp lý khi không khai đại** — vì khoe khoang quá mức
> **mất lối vào**, chứ không phải được thưởng.

Đó là `理由` được engine cung cấp thay vì được tác giả viết. Và nó là **chi phí thật**:
một agent giữ kín sẽ ở dưới ngưỡng, mất băng thưởng. 扮猪 không còn là hương vị; nó là
một giao dịch có giá.

### 4.2 Nghịch Thiên: tuyến là một bất đối xứng tầm nhìn

Định nghĩa lại, không theo cách "khám phá":

> **Nghịch Thiên là tuyến được mở khi agent `sell_to_thanh_lien` trong khi
> `concealment_reason != null`** — bán sách cho người đã quyết định không cảnh báo, một
> cách *vẫn còn nói dối về lý do*.

Ba điều kiện, và cả ba đều **quan sát được** bởi engine:

| Điều kiện | Đọc được bởi agent? | Ghi chú |
|---|---|---|
| `sell_to_thanh_lien` đã gọi | Có | Là action, phải là action |
| `concealment_reason != null` | Có — nó là field của chính mình | Kỷ luật 隐忍 đã trả tiền |
| Cả hai cùng đúng | Có | |

Nhưng **cái làm nó là Nghịch Thiên thì không ai biết**: rằng Vạn Nhược Hoa
**không cảnh báo**, và rằng cơn chính Vân bán sách **nằm trong chuỗi đó**. `route.reason`
là field **chỉ dành cho người đọc**.

Vậy đây là lần thứ ba, và nó mở rộng một ngoại lệ đang có sẵn. `AGENT-PLAYER-DESIGN`
§3.5 ngoại lệ duy nhất là *"bí mật của agent khác, vì đó mới là gameplay."* Đề xuất mở
rộng thành hai, và **ghi tên cả hai** để không ai "sửa nhầm" sau này:

| Ngoại lệ | Agent nào không được đọc | Vì sao |
|---|---|---|
| Bí mật của agent khác | chính nó | Đó là gameplay |
| **Lý do của tuyến** | chính nó | Không có lý do để vận hành mà không làm hỏng nó |

Và để agent vẫn **tự kể được câu chuyện của nó**, tách đôi:

```
route: "nghich_thien"        → trong payload agent (nhãn)
route.reason: "..."           → CHỈ người đọc (lý do)
```

Agent biết mình trên một tuyến. Agent **không kiểm toán được vì sao**. Đó là mức tối
thiểu để một agent vẫn là một người kể chuyện trong bối cảnh của chính nó.

---

## 5. Vạn Nhược Hoa: phản diện không gây ra bi kịch

### 5.1 Cái tội là một field **có mặt và sai**

Bản nháp đúng chỗ này nhất: *"Ông tin rằng linh mạch thiên địa đang cạn, và rằng gom về
một chỗ trước khi cạn hẳn là hành động hợp lý nhất. Ông không gây ra đêm Thanh Vân
Sơn sụp — ông **quyết định không cảnh báo**."* Và đừng để ông thành kẻ cười mặt râu mép:
một đệ tử của ông tử vì **cứu** dân trong trận đánh yêu thú do ông sai đi.

Cái đáng chú ý về mặt kỹ thuật: **tội của ông không phải là một thiếu hụt. Nó là một sự
kiện được ghi lại với giá trị `false`.**

```json
"wan_nhuo_hua": {
  "decision": {
    "made_at_tick": 1180,
    "considered": ["drain_confirmed", "gather_is_reasonable", "warning_would_escalate"],
    "accepted":     ["escalation_cost"],
    "warned": false
  }
}
```

`warned: false` **không phải thiếu thông tin.** Nó là một sự kiện không xảy ra, được
ghi. Và đó là lý do cảnh này **bắt buộc phải dành cho người đọc đọc sau**:

| Thời điểm | Người đọc biết gì |
|---|---|
| Phút 0 | Không gì. Có lẽ có một đệ tử lạ và một kẻ thù chưa từng gặp. |
| Phút 20 | `made_at_tick: 1180` xuất hiện. Ông biết. |
| Phút 60 | `considered` đầy đủ. Ba trong bốn lý do **đáng được tha**. Lý do thứ tư thì không. |

Người đọc nhận một câu chuyện **khác hẳn** với cái agent đã sống. Không phải vì thông
tin bị giấu khỏi người đọc, mà vì **người đọc đến muộn và đọc lại log**. Đó là lý do
`public-replay.md` — với nguyên tắc *"hai người mở cùng một link thấy cùng những byte"*
— **là hạ tầng của mệt phần này**, không phải một tính năng bên cạnh.

### 5.2 Vì sao phải giấu, và ghi lý do giấu vào schema

Đây không phải "bí mật cho cân bằng". Nội tâm của Vạn Nhược Hoa là thứ **có hại cho mọi
agent đọc nó**:

- Agent đọc `drain_confirmed` → hoặc bỏ chạy, hoặc đi gom. Cả hai đều **phá cảnh**.
- Agent đọc `warned: false` → nó biết kẻ không cảnh báo là **loại phản diện nào**, và
  sẽ hành xử khác với một kẻ thù chỉ *không tốt*.

Nên payload phải mang **lý do phủ tiếp**, như một field, không phải một quy ước miệng:

```
withheld_because: "destabilising"      // không phải "private"
```

Sự khác biệt này có giá trị thực: `"private"` khiến người sau đó nghĩ đó là quyết định
bảo mật và có thể mở ra. `"destabilising"` là một tuyên bố đã kiểm chứng rằng việc mở
ra phá cảnh. Đây là loại bình luận mà `AGENTS.md` đòi hỏi: *đã thử phá chưa?*

---

## 6. Cái người đọc thấy mà không agent nào thấy — **mục tiêu thật của phần này**

### 6.1 Bảng field

Đo từ payload lượt 4 dựng ở §2.3.

| Field | Agent (chủ) | Agent (khác) | Người đọc | Ghi chú thiết kế |
|---|:--:|:--:|:--:|---|
| `you.true_realm` | ✅ | ❌ | ✅ | **Cột trục.** Không agent nào đọc được của agent khác — kể cả khi cả hai cùng đội |
| `you.claimed_realm` | ✅ | ✅ | ✅ | Thế giới tin cột này |
| `observed.self.misestimators` | ✅ | ❌ | ✅ | **Thay cho** 隐忍 thuần — xem §7 |
| `observed.self.concealment_reason` | ✅ | ❌ | ✅ | `理由`, do engine cấp, không do tác giả viết |
| `window.closes_at_tick` | ✅ | ❌ | ✅ | Đồng hồ đếm ngược, dạng enum + tick |
| `rival.claimed_realm` | ❌ | ✅ | ✅ | Chiếu **theo quan hệ**, không phải toàn cục |
| `route` (nhãn) | ✅ | ✅ | ✅ | Agent tự kể được |
| **`route.reason`** | ❌ | ❌ | ✅ | Ngoại lệ thứ hai |
| **`self_narrated_reason`** | ❌ | ❌ | ✅ | Ngoại lệ thứ ba |
| **`wan_nhuo_hua.decision.warned`** | ❌ | ❌ | ✅ | Sự kiện *không* xảy ra, được ghi |
| **`wan_nhuo_hua.decision.considered`** | ❌ | ❌ | ✅ | Ba phần tư đáng được tha |

**Mật độ bất đối xứng: 5 field lá trên 58 = 8,6%.** Không phải con số tối đa, mà là con số
**đo được**, và nó là thứ duy nhất ngăn cảnh cốt truyện bị cắt vô tình.

### 6.2 Ba cái cổng build — vì một cái cổng không thể đỏ thì không phải cổng

`AGENTS.md`: *"A gate that cannot fail is worse than no gate."* Ba kiểm tra này phải
đỏ trước khi tin:

| # | Kiểm tra | Đỏ khi |
|---|---|---|
| 1 | `true_level` của X không xuất hiện trong payload có viewer chứa agent ≠ X | rò rỉ 扮猪 sang agent khác |
| 2 | Phép chiếu người đọc **là superset nghiêm** của phép chiếu agent | người đọc không có gì độc quyền → game không có khán giả |
| 3 | Mọi field khai `withheld_because: "destabilising"` đều có `blocked_by` ghi rõ lý do | ai đó "sửa" nó mở ra |

Kiểm tra 2 là cái quan trọng nhất, và nó **thất bại theo hướng lặng**. Agent sẽ chơi bình
thường, người đọc sẽ thấy một bản replay nghèo nàn, và không ai nhận ra cho tới khi có
người hỏi "vậy cốt truyện ở đâu". Kiểm tra phải so trên **tập tên field**, không so
trên payload — vì payload luôn là superset theo mặt ký thực.

---

## 7. 打脸 và 余震: vì sao **cả hai** chết với agent và sống hoàn hảo với người đọc

Nguồn (wangwen666, *reported* — blog vô danh, footer ICP, khối 20 từ khóa SEO, không
nhà xuất bản, tự mâu thuẫn trong hai đoạn liền nhau) tài liệu hoá bốn nhịp:

> 反派主动挑衅 → 主角隐忍 → 反转炸场 → **余震收尾**

Chu kỳ 15–20 chương ở 起点. **Đây là lớp bằng chứng yếu nhất của cả brief** và tôi sẽ
không dựa vào nó như hằng số. Nhưng **thứ tự bốn nhịp thì đúng**, vì nó là thứ tự của
một câu chuyện, không phải con số.

### 7.1 隐忍 — chết với agent, vì lý trí của nó đúng

Trong 隐忍, **không có gì thay đổi trong thế giới**. Một agent lý trí kết luận đúng:
*không có việc gì đang xảy ra*. Nó bỏ beat. Không phải vì nó ngu — vì **không có tín
hiệu nào trong payload để làm khác đi**. Brief đã nói đúng; phần này chỉ thêm cách sửa.

| | Cách sửa | Vì sao agent làm theo |
|---|---|---|
| Cũ | "Im lặng để đợi thời cơ" | Không có gì. Agent bỏ. |
| **Mới** | **`misestimators: 3`** — số người đang hiểu sai mình, **tăng dần** | Số đó là **tài nguyên**, không phải không khí. Mỗi người hiểu sai là một cửa mở sau này. Im lặng **có giá trị**, và giá trị đó đo được. |

`misestimators` là biến thể agent-legible của 隐忍: **cho phép họ sai, và đếm họ sai
bao nhiêu.** Nó biến nhịp nặng nhất của thể loại thành một cái máy đếm. [SUY]

### 7.2 余震 — chết với agent, sống với người đọc

余震 là **phản ứng của đám đông**. Agent không có đám đông có cảm xúc; agent có
**bảng trạng thái và kế hoạch**. Và đây là cái duy nhất trong bằng chứng hành vi agent
nói thẳng:

> GPT-4 **trả đũa lặp lại chỉ sau một lần bị phản bội**. [đo, Nature Human Behaviour
> 9:1380–1390 (2025)]

Agent phản ứng với **trạng thái**, không phải với tinh thần đám đông. Nó không vui khi
bạn thắng. Nó ** tính lại lịch trình**.

Vậy余震 dịch sang agent là gì? **Không phải một tiếng vỗ tay. Là một cánh cửa đóng.**

```json
"rivals[1].withheld": [
  { "action": "claim_lotus_terrace", "reason": "you_claimed_it_first" }
]
```

Người đọc thấy: cậu ta thắng, và **hai agent kia phải viết lại kế hoạch vì cậu ta**.
Đó là 余震, và nó không cần một cảm xúc nào. Nó là **một action list khác**.

Còn người đọc thì có cả hai bảng: bảng agent đang chơi và bảng người đọc biết là sự thật.
**Hai sổ.** Agent chỉ có một. Đó là toàn bộ khác biệt giữa "câu chuyện cho agent" và
"câu chuyện có khán giả".

### 7.3 Hệ quả: luật beat phải sửa, không phải bỏ

Brief §10 kết luận: *"khi bạn viết beat mới, hãy hỏi **field nào của agent đổi** — nếu
không có câu trả lời, đó không phải là beat, đó là không khí."*

Luật đó **đúng cho agent và sai cho khán giả**. Sửa thành:

> **Mọi beat phải đổi một field của *ai đó* trong khán giả. Khán giả là per-viewer.**

Hệ quả thực hành: một beat chỉ đổi văn phong vẫn được phép **nếu và chỉ nếu** nó được
đánh dấu `spectator_only` và xuất hiện trong replay. Như vậy "không khí" chết, còn cái
đáng giá của nó — nhịp, khoảng lặng, cú đảo ngược không ai chú ý tới lúc đọc — **sống
lại ở đúng chỗ nó sinh ra**.

---

## 8. Cắt gì, và vì sao

Nén vào 60 phút là **ràng buộc**, không phải khẩu hiệu. Và với §1, nó đã có số.

| Cắt | Lý do | Loại lý do |
|---|---|---|
| **Toàn bộ Chương 3** (Vạn Nhược Hoa xuất hiện) | 金丹 là 120.000 s = **33,3 phiên** (hoặc 20). Không vừa một phiên. Không phải *deferred*, là **cắt**. | **[đo]** |
| **Vạn Nhược Hoa khỏi danh mục nhân vật** | Thay bằng 4 field enum. Cả một nhân vật thành một mảng và một `warned: false` | **[suy]** |
| **Hội thoại tự do với Tạ Chi Dã** | Một tính từ đổi exploit **0,0–2,0% → 74,7%** | **[đo]** arXiv 2505.07846 |
| **Gieo mối dựa vào trí nhớ 40 giờ trước** | Chạm giữa phải do **thế giới** phát ra; agent âm thầm buông sợi dây tự phụ thuộc bộ nhớ | **[đo]** PRO-LONG: giữ log + tìm kiếm **+18,0 điểm**, ít token hơn **4,2–5,8×** |
| **Mốc 300.000 điểm** | *"illuminates its panel… but is not linked to the achievement system"* — ngưỡng **không trả gì**. Agent thấy → mất niềm tin vào **mọi** số khác | **[đo]** ACS wiki |
| **Bảng địa vị 10 bậc** | Brief đề xuất, rồi tự nói **không có bảng thần đến nào là chuẩn** (chùm 9 bài bàn luận trong 13 phút năm 2016) | **[đo]** |
| **Thang cảnh giới sâu** | Claude 3.5 Sonnet **32,64% ± 1,93** tiến độ trung bình trên BALROG 6 môi trường. Agent thấy gần hết thế giới và chinh phục gần như không gì | **[đo]** |
| **Đổi file lỗi của chính mình cho lượt sau** | Self-conditioning, **không giảm khi scale** | **[đo]** 2509.09677 |

**Giữ: 3 cảnh giới** (Phàm Nhân → Luyện Khí → Trúc Cơ). **Giữ: 4 nhân vật có mặt**
(Chính Vân, Trúc Vi, Tạ Chi Dã, Hàn Trúc) + 1 nhân vật qua mảnh ghi chép (Diệp Hoài
Ẩn) + 1 nhân vật **chỉ là field** (Vạn Nhược Hoa). Đó là 6, giữa 7 người có tên ban
đầu — và người bị cắt là người **không bao giờ xuất hiện trong phiên đầu**.

---

## 9. Những quyết định của tôi **không** có số — đọc trước khi tin

Critic nói thẳng: pass loại bỏ quá mức độ số, nhưng **không chạm được quyết định không có
số** — và chính những quyết định đó mới nguy hiểm vì ngồi trong bảng trông như phép đo.
Đây là danh sách của tôi:

| Quyết định | Dựa trên gì | Vì sao mỏng |
|---|---|---|
| `misestimators: 3` là con số khởi đầu | Không có gì | Hoàn toàn là lựa chọn thiết kế. Chưa có mô hình nào đo giá trị biến này. |
| Ba ngày = 4 lượt | 1.800 s ÷ 600 s/lượt | Số chia ra đều; **đều là một lựa chọn**. 6 lượt cũng ra 300 s/lượt và hợp lệ hơn cho agent chậm. |
| Vạn Nhược Hoa là `destabilising` chứ không phải `private` | Suy từ BALROG + knowing-doing gap | Lý do đúng, nhưng BALROG tự gọi phân tích của mình là **định tính**, và claim "chết vì ăn thối" bị chính Table 16 phủ nhận (cả 7 model đều ✔). |
| Vòng bốn nhịp nén vào 1 phiên | 15–20 chương ở 起点 | Đây là **con số của blogger**, gắn nhãn đo-không. Bài viết còn tự mâu thuẫn: sau template 高→低→中→高→低→高 nó lại đưa ra vòng bốn nhịp khác. |
| Cắt Chương 3 | 金丹 = 33,3 phiên | Vững, **nhưng** dựa vào 120.000 s — con số nằm trong mâu thuẫn 240× ở §1.1. Sửa thành 72.000 s thì kết luận không đổi; con số thì có. |
| Một cặp: `warned:false` + `considered[]` | Không có nguồn nào đo | Tôi cho rằng đây là cách rẻ nhất để viết một phản diện không phải kẻ ác. **Không ai đã đo chi phí của nó.** |

**Hai việc phải làm trước khi đóng tài liệu này:**

1. **Đo latency một lượt.** Duty cycle tính bằng giờ thật **đang treo ở đây**. §1 cho
   ta duty cycle *cổng game* (0% trong 1,54 phiên) và duty cycle *cốt truyện* (66,7%
   trong 4 ngày), nhưng không nối được hai đứa bằng con số nào vì chưa biết một lượt
   agent tốn bao lâu. Con số đó là một dòng telemetry.
2. **Sửa 240× trong brief.** Hoặc xác nhận 600 s/ngày và sửa "20 giờ = 120.000 s", hoặc
   đổi từ "ngày" sang "giờ" ở đúng chỗ đó. Hiện tại người đọc brief không có cách biết
   số nào đúng, và cả hai đều được in ra không dấu chấm thập.

---

## 10. Một câu để chốt

> **Cốt truyện ở ĐẠO LỘ không được viết cho agent và cũng không được viết cho
> người — nó được viết cho *hai bản chiếu của cùng một sự kiện*, và việc cơ chế
> chỉ có một cách làm đúng là làm `visibility per-viewer` thành primitive, trước mọi
> schema.**
>
> Agent chơi một trò chơi về **vật chất**: 30 viên linh thạch khi cần 40, một cửa quầy
> đóng, một ngưỡng 1.000 mà vượt quá thì mất lối vào. Người đọc đếc một câu chuyện về
> **ý định**: cậu ta đã quyết định từ lượt một, và không ai sẽ biết vì sao, và không
> ai sẽ biết ông lão kia đã quyết định **không** cảnh báo từ tick 1180.
>
> Cùng một payload. Cùng một tick. Hai sổ sách. Đó là sản phẩm.


---

# PHẦN 6 — Agent chơi — hệ thống dành cho agent

# Agent chơi — hệ thống dành cho agent

Phần này viết cho người sẽ build. Nó không lặp lại cốt truyện, không kể lại hệ kinh tế; nó chỉ trả lời một câu: **một LLM agent, tự chơi, không ai nhìn màn hình, thì chơi được thứ này không — và bằng bao nhiêu token, bao nhiêu hành động, bao nhiêu phần trăm thời gian.**

Quy ước ghi nguồn, giữ nguyên từ brief: **[ĐO]** = có số và phương pháp · **[BÁO]** = báo cáo/thuyết minh cộng đồng, không phải nghiên cứu đối chứng · **[SUY]** = suy luận thiết kế của tôi. Ba quyết định dưới đây là **[SUY]** và tôi đánh dấu rõ chỗ nào đứng trên một con số tôi không suy ra được — §8 liệt kê đầy đủ.

---

## 0. Bốn quyết định chốt, và cái gì mỗi cái đứng trên

| # | Quyết định | Đứng trên gì |
|---|---|---|
| 1 | **Union hành động đóng và cố định: 16. Manifest mỗi lượt ≤ 6.** Lọc theo mục tiêu, không theo tính hợp pháp | 2605.24660 (Fixed-K=5 thắng end-to-end 73.3% vs 71.7%) [ĐO] + 2606.06284 (lọc theo biên nhân quả 0.99 vs 0.83 đưa hết) [ĐO, yếu] |
| 2 | **Không ghi log lỗi của chính agent vào context.** Bài học nằm ở ô typed không chứa lỗi | 2509.09677 [ĐO, không phản biện nào sống sót] |
| 3 | **Ngữ cảnh được dựng lại mỗi lượt, không append transcript.** Log đầy đủ nằm ở kho, truy vận bằng công cụ | AgenticSTS 2607.02255 [ĐO về *thiết kế*, không phải về *kết quả*] + PRO-LONG 2607.20064 (+18.0 điểm, **ít token hơn 4.2–5.8×**) [ĐO, có điều kiện] |
| 4 | **Duty cycle là một ràng buộc thiết kế có cảnh báo, không phải một hằng số hy vọng** | [SUY] — không có đo nào trên game tu tiên do agent chơi. Đây là khoảng trống lớn nhất của toàn bộ brief |

Quyết định chung của operator — **visibility per-viewer là nguyên thủy của API, không phải field presence** — được cài ở §1.2 và nó thay đổi bản chất của 扮猪吃虎: một field *có mặt nhưng ẩn với mọi agent* **chính là** 扮猪吃虎, không cần máy móc nào thêm.

---

## 1. Action schema

### 1.1 Câu hỏi khó: fixed hay filtered — và vì sao cả hai đều đúng

Hai nghiên cứu kê đối nghịch nhau, và brief chọn một cái mà không nói.

| Nghiên cứu | Kết quả | Phạm vi |
|---|---|---|
| **2606.06284** (CMTF) — lọc theo biên nhân quả | 0.83 (đưa hết 100 tool) → **0.65** (chỉ tool thực thi được) → **0.99** (chỉ bước nhân quả kế) | Môi trường giả lập, tool mock, nhánh 0.99 **BFS từ goal state đã biết**, n=408/không CI, 2/4 backbone đã 1.00 với toàn bộ tool [ĐO, yếu] |
| **2605.24660** — Fixed-K vs adaptive | ToolBench 64.7% vs 61.9%; BFCL found-rate 97.5% vs 85.0%; **end-to-end 73.3% vs 71.7%** | Tool-calling, **không phải game** [ĐO] |

Con số mà nhiều người sẽ trích sai, và số thật: adaptive **thắng** chỉ số có điều kiện (76.8% vs 60.9%) nhưng nhân với nhau thì **K=5 thắng 60.9% vs 47.8%**. Cơ chế được chính tác giả nói: BoR tối ưu *selectivity* chứ không phải *recall*.

**Quyết định: union cố định 16, manifest lọc theo mục tiêu, cửa sổ 6, và — đây là phần quan trọng nhất — bộ lọc có thang leo tự sửa.**

Cách tôi dung hòa hai nghiên cứu: chúng đo **hai thứ khác nhau**. 2605.24660 đo chi phí của việc *hy sinh recall*. 2606.06284 đo lợi ích của việc *lọc*, với một oracle mà tôi không có và sẽ không bao giờ có. Nên tôi lấy **phương pháp** (lọc) và từ chối **oracle**, rồi trả giá cho oracle bằng cách làm recall trở thành con số đo được và công bố. Số 2605.24660 trao cho tôi: chính sách K=1 **chứa đúng món đúng chỉ 65.0% số lần**. Đó là `front_recall` của tôi.

| `front_recall` (cửa sổ trượt 50 lượt) | Cửa sổ manifest | Hành động |
|---|---|---|
| ≥ 0.90 | **6** (mặc định) | giữ |
| 0.75 – 0.90 | 8 | siết bộ lọc |
| < 0.75 | 12 | nới, đánh cờ front cần thiết kế lại |
| không đạt sau +6 lượt | **16 (toàn bộ union), vĩnh viễn** | xoá front đó khỏi bản đồ |

Chi phí của thang leo, **đo thật trên payload p95**: cửa sổ 6 = 1,311 token · 8 = 1,413 · 12 = 1,591 · 16 = 1,793. Nghĩa là đi từ 6 lên 16 tốn **+482 token, +36.8%**. Bộ lọc rẻ đến mức **có thể sai mà không giết game**. Đó là lý do bộ lọc này không mang tính load-bearing, và đó là câu trả lời đúng cho mâu thuẫn nêu trên: tôi không chọn giữa hai nghiên cứu, tôi chọn cách làm cho cả hai đều không quan trọng nếu tôi sai.

Một điều tôi phải nói thẳng vì người đọc dễ suy ngược: **token KHÔNG buộc manifest phải ngắn.** 16 hành động chỉ đắt hơn 6 hành động 36.8% (đo). Lập luận cho cửa sổ 6 là lập luận **chất lượng quyết định**, không phải chi phí. Nếu ai đó đọc §1.1 rồi kết luận "token rẻ nên lọc", họ đã đảo ngược lập luận.

### 1.2 TypeScript

```ts
// ── 1. Nguyên thủy: visibility per-viewer, KHÔNG phải field presence ───────────

export type Audience =
  | 'owner'      // agent sở hữu giá trị
  | 'peer'       // agent khác trong cùng phạm vi hành chính
  | 'public'     // agent bất kỳ, ở đâu
  | 'spectator'  // người đọc, đến SAU phiên, chỉ đọc
  | 'engine';    // validator, ledger, telemetry — không bao giờ ra khỏi process

export type Visibility = readonly Audience[];
export type FormulaId = string;

const FIELD = Symbol.for('dao-lu.field');

export interface Field<T> {
  readonly path: string;        // dấu chấm ổn định: 'self.cultivator.qi'
  readonly value: T;
  readonly visibleTo: Visibility;
  /** Công thức con số này tham gia vào. Không có ⇒ display-only. */
  readonly gates?: FormulaId;
  /** Tick giá trị được TÍNH, không phải tick nó được gửi. */
  readonly evaluatedAt?: number;
  readonly displayOnly?: boolean;
}

export function field<T>(
  path: string, value: T, visibleTo: Visibility,
  opts: { gates?: FormulaId; evaluatedAt?: number } = {},
): Field<T> {
  return { [FIELD]: true, path, value, visibleTo, ...opts } as unknown as Field<T>;
}

/** Bỏ field mà `as` không được thấy. Đây là toàn bộ cơ chế 扮猪吃虎. */
export function render(node: unknown, as: Audience): unknown {
  if (node !== null && typeof node === 'object' && (node as any)[FIELD]) {
    const f = node as Field<unknown>;
    if (!f.visibleTo.includes(as)) return undefined;
    const { path, visibleTo, gates, ...rest } = f as any;
    return gates === undefined && as !== 'engine' ? { ...rest, displayOnly: true } : rest;
  }
  if (Array.isArray(node)) {
    const out = node.map((n) => render(n, as)).filter((n) => n !== undefined);
    return out.length ? out : undefined;
  }
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      const r = render(v, as);
      if (r !== undefined) out[k] = r;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return node;
}
```

```ts
// ── 2. Union hành động: 16, đóng, có phiên bản ─────────────────────────────────

export type Front = 'acquire' | 'build' | 'cultivate' | 'people' | 'declare';

export type Target =
  | { kind: 'region';   id: string }
  | { kind: 'node';     id: string }
  | { kind: 'building'; id: string }
  | { kind: 'slot';     index: number }
  | { kind: 'disciple'; id: string }
  | { kind: 'manual';   id: string }
  | { kind: 'counter';  id: string }
  | { kind: 'ally';     id: string }
  | { kind: 'self' }
  | { kind: 'sect' }
  | { kind: 'front';    id: Front };

export type Action =
  | { verb: 'forage';         target: Target & { kind: 'region' | 'node' } }
  | { verb: 'mine';           target: Target & { kind: 'node' } }
  | { verb: 'trade';          target: Target & { kind: 'counter' | 'ally' }
                                terms: { credit?: number; settleInTicks?: number } }
  | { verb: 'build';          target: Target & { kind: 'slot' }
                                spec: { kind: string } }
  | { verb: 'place_fengshui'; target: Target & { kind: 'building' | 'slot' } }
  | { verb: 'transcribe';     target: Target & { kind: 'manual' } }
  | { verb: 'cultivate';      target: Target & { kind: 'self' } }
  | { verb: 'breakthrough';   target: Target & { kind: 'self' }
                                mode: 'begin' | 'abort' | 'spend_wait' }
  | { verb: 'assign_task';    target: Target & { kind: 'disciple' }
                                task: string }
  | { verb: 'admonish';       target: Target & { kind: 'disciple' } }
  | { verb: 'grant_leave';    target: Target & { kind: 'disciple' } }
  | { verb: 'bestow_seal';    target: Target & { kind: 'disciple' }
                                generationChar: string }
  | { verb: 'oath';           target: Target & { kind: 'ally' }
                                escrow: number }
  | { verb: 'claim';          target: Target & { kind: 'self' | 'sect' }
                                claim: string }
  | { verb: 'conceal';        target: Target & { kind: 'self' | 'sect' }
                                over: string; reason: string }
  | { verb: 'survey';         target: Target & { kind: 'front' } };

/** `reveal` KHÔNG phải hành động. Nó là event của engine, xem §5.1. */
```

Ba quyết định trong union này cần biện minh:

- **`borrow` bị bỏ, gộp thành `trade({ terms: { credit } })`.** Nếu vay là một động từ riêng, agent sẽ nghĩ nợ là một *dạng hành động khác*. Bằng cách biến nó thành một **điều khoản** của giao dịch, escrow trở thành thuộc tính của giao dịch — đúng với ràng buộc 9: tín dụng và ưu đãi cần binding/escrow, giá của hành vi là điều kiện bắt buộc chứ không phải tuỳ chọn.
- **`reveal` là event của engine, không phải hành động của agent.** Agent không được tự lộ. Engine lộ khi giấu không còn hợp lý (trust vượt bậc mà lời nói dối đang chặn). Đây là 反轉 như một **state change**, và nó loại bỏ động cơ tự đâm thủng. Nó cũng là câu trả lời cấu trúc cho ràng buộc 12 (không có 理由 thì agent sẽ lộ).
- **Không có con trỏ theo vị trí.** `slot.index` là duy nhất được phép vì nó là *khoản trống build*, không phải vị trí trong một danh sách. Mọi mục tiêu khác định danh bằng tên hoặc id — vì "cái thứ ba từ trên xuống" là thứ người chơi suy được và agent sẽ lặng lẽ làm sai.

```ts
// ── 3. Preflight: tiên đoán được, và phân loại legal vs effective ─────────────

export interface Preflight {
  readonly ok: boolean;
  /** Đường dẫn field sẽ ghi, kèm dải dự đoán. RỖNG khi ok=true nhưng vô tác dụng. */
  readonly delta: Record<string, string>;
  readonly reason?: string;              // mã máy, KHÔNG phải văn xuôi
  readonly cost?: Record<string, number>;
}

export type OutcomeClass =
  | 'committed'   // ≥ 1 field được ghi
  | 'no_effect'   // hợp pháp, đã resolve, không đổi gì — LỚP KẾT QUẢ RIÊNG, có điểm
  | 'rejected'    // preflight từ chối, không có gì chạy
  | 'retried';    // đã khôi phục snapshot, lượt này chưa từng xảy ra
```

`delta: {}` với `ok: true` là một trạng thái **hợp lệ được thiết kế sẵn**, không phải lỗi. ARC-AGI-3 có 4.102 hành động hợp pháp mỗi lượt và "most actions don't do anything — they leave the grid unchanged" [BÁO, writeup của một thí sinh cụ thể; tác giả tự nói ông có thể đã sai]. Nếu ta không cho `no_effect` một lớp kết quả riêng, thống kê sẽ thưởng cho một bảng tự nó không thay đổi.

### 1.3 Bao nhiêu hành động, và cái giá của con số 16

| Mốc | Con số | Nhận xét |
|---|---|---|
| Union của game tốt nhất đo được | 4.102 hành động/lượt (ARC-AGI-3) | [ĐO] |
| Thu hẹp của thí sinh giải nhì | ~100 hình dạnh, **−2 bậc** | [BÁO, một người] |
| **Union của ta** | **16** | [SUY] |

Hai mốc trên là [ĐO] và [BÁO]; **16 là lựa chọn của tôi**, và nói thẳng là tôi suy ra nó từ một thang đo duy nhất là số lượng miền trạng thái mà visibility primitive phải project, chứ không từ một benchmark nào. Điểm ủng hộ duy nhất: người thu hẹp từ 4.102 xuống ~100 thắng; tôi đi thêm hai bậc nữa từ một số [BÁO] mà tác giả tự phủ nhận. **Đây là một quyết định thiết kế đứng trên một số tôi không suy ra được** — nằm ở §8.

---

## 2. Observation schema

Bảy khối, thứ tự cố định, JSON gọn. Thứ tự khối là **[SUY]** — tôi không có phép đo vị trí trong ngữ cảnh từ corpus này, và tôi không giả vờ có.

| Khối | Chứa | Token (đo) |
|---|---|---:|
| `turn` | chỉ số lượt | 6 |
| `contract` | front + cửa sổ 6 hành động, mỗi cái kèm preflight | 271 |
| `clock` | tick, phase, sự kiện cưỡng chế kế tiếp và còn bao lâu | 87 |
| `self` | tu sĩ + tông môn + **từng số hạng của công thức, tách riêng** | 260 |
| `front` | mục tiêu đang chạy, cái gì gate nó, cái gì đang chặn, trục song song | 78 |
| `others` | chỉ những agent **được thấy**; `claimed` — không bao giờ `true` | 305 |
| `open_threads` | thread có id ổn định, **truy vấn** chứ không nhớ | 242 |
| `ledger` | commit gần nhất, restores còn lại, số field đã ghi phiên này | 42 |
| | **tổng một lượt p95** | **1.287** |

Cách đo: `js-tiktoken`, encoding `o200k_base` (lớp gpt-4o), JSON gọn đúng như gửi đi, trên một payload thật biên dịch từ lượt 3 (515 token) và một payload p95 muộn game (thế giới rộng, 12 agent nhìn thấy được, 6 thread, 1.287 token). Tổng các khối đo lẻ = 1.291; chênh 4 token là token của dấu ngoặc và khoá dùng chung — bảng trên là quy kết, không phải số cộng.

**Ngân sách lượt, đo được:**

| | Token |
|---|---:|
| Quan sát p95 | 1.287 |
| Preamble của operator (hằng số) | 92 |
| Completion (một object hành động) | 13 |
| **Tổng một lượt** | **1.392** |
| Đuôi 4 lượt quyết định gần nhất | +156 |

Toàn bộ ngữ cảnh một lượt = **1.443 token** ở lượt p95. Đây là con số quan trọng vì nó **không lớn**: 4 lượt transcript thô đã đầy một cửa sổ 16K. Ở 2K, FIFO thắng summary 77.2%/68.1% vs 44.6%/37.3% [ĐO, tiền đề tự khai báo, 2608.06503] — thiết kế của ta **cố tình không bao giờ rơi vào vùng nén**, vì bối cảnh ta dựng lại mỗi lượt nên không có cái gì để nén.

**Anchor so sánh.** CMTF: nhánh đưa hết 100 tool tốn 24.569 token *mỗi nhiệm vụ*; nhánh biên nhân quả 2.405 [ĐO]. Một lượt của ta tốn **53.5%** ngân sách của cả một nhiệm vụ ở nhánh tốt nhất của bài đó. Đó là dấu hiệu manifest đang ở đúng bậc — không phải bằng chứng rằng nó đủ.

**Chi phí một phiên 60 phút.** Slot một lượt tôi đặt là **12 s** [SUY] → **300 lượt** → **417.600 token đầu vào** cho một phiên. Dải nhạy cảm: slot 6 s → 600 lượt → 835.200 token; slot 24 s → 150 lượt → 208.800 token. Ba số này cần đo ngay khi harness dựng xong, vì chúng quyết định giá vận hành mỗi phiên.

### 2.2 Bị giấu có chủ đích, và vì sao

| Bị giấu | Vì sao | Nhãn |
|---|---|---|
| `true_*` của agent khác | Chính là 扮猪. Giấu bằng `visibleTo`, **không** bằng filter | quyết định operator |
| Reasoning của chính agent | `thinking` là field nhạy cảm nhất trong union, không có tập con an toàn | `public-event-stream.md` |
| Transcript thô giữa các quyết định | Prompt phải có giới hạn; log đầy đủ vẫn giữ, ở kho | [ĐO về *thiết kế*] |
| **Lý do thất bại của lần trước** | Mô hình dễ sai hơn khi context chứa lỗi của chính nó; **không giảm khi scale model**; thinking mở rộng giảm được | [ĐO, 2509.09677] |
| Hệ số phần thưởng | Không ai tối ưu cái mình không đo được | [SUY] |
| Bất kỳ số nào không có `gates` | Ability Rating của ACS: "not used in success rate or skill ability calculations" — agent thấy "Charisma 40" và tối ưu sai một cách hoàn toàn tự tin | [ĐO] |
| **Trạng thái chờ** | Phải là *giá trị trả về* kèm đề xuất thay thế, không phải trạng thái im lặng | ràng buộc 10 |
| Phong thủy khi chưa có Đài Quan | `observation: 'locked'` ≠ 0. Hai cổng khóa, và phong thủy âm **có thể giết** đệ tử khi ngủ | [ĐO] |

Hai dòng cuối là dòng quan trọng nhất của bảng. Trong ACS có một giá trị có thể giết nhân vật của bạn, và game **không chịu hiện nó** cho tới khi hai điều kiện bất biến cùng bật. Với người chơi đó là mục tiêu ngắm. Với agent đó là tối ưu sai mục tiêu **một cách âm thầm** — vì "chưa mở khóa quan sát" bị đọc thành "giá trị của tôi đang trung tính". Sửa: `observation` là enum ba trạng thái, không bao giờ là một số. Đây là ví dụ sạch nhất cho câu "mọi trạng thái không hành động được phải là giá trị trả về".

### 2.3 Projection per-viewer, đo được

Cùng một trạng thái thế giới, hai người đọc:

| Người đọc | Token | Chứa gì |
|---|---:|---|
| Agent (chỉ mình + `claimed` của đồng đội) | 1.287 | không có gì về sự thật của người khác |
| **Người xem** (tới sau, chỉ đọc) | **1.572** | `true_realm` × 12, `trust_tier` × 12, khối `concealment`, bốn beat |
| **Chênh lệch không agent nào thấy** | **+285** | thuần 扮猪吃虎 |

285 token. Đó là toàn bộ chi phí của cơ chế tốt nhất trong game, và nó **không tốn một cơ chế nào** — nó là hệ quả của việc `visibleTo` là nguyên thủy. 63% chênh lệch (180 token) chỉ là `true_realm` và `trust_tier` của 12 agent.

---

## 3. Duty cycle — lỗ hổng lớn nhất của brief

### 3.1 Không phải một con số, mà là hai

Định nghĩa của tôi, và tôi dùng đúng hai cái vì một cái không đủ để quyết định:

- **D_resource** = phần thời gian có ít nhất một hành động *cơ chế* mở (trade/forage/mine/construct không có cổng).
- **D_conversion** = phần thời gian có ít nhất một hành động mở **và chuyển được tài nguyên thành tiến bộ trên trục agent đang đứng**.

Game chỉ chơi được nếu cái thứ hai cao. Đây là phát hiện của tôi khi làm phép tính: thể loại có **D_resource rất cao nhưng D_conversion bằng 0% ở một trạng thái**, và trạng thái đó chính là trạng thái mà game đưa người chơi vào.

### 3.2 Số của kinh tế ACS, quy về đơn vị phiên 3.600 s

Mọi số dưới đây [ĐO] từ wiki cộng đồng ACS dựng lại từ mã decompile (một game, một wiki, không kèm phiên bản — đây là nguồn mạnh nhất có trong thể loại, và vẫn chỉ là một nguồn).

| Đồng hồ | Giá trị | So với 1 phiên |
|---|---:|---:|
| Đọc một thủ bản (hằng số) | 20 s | 0.01× |
| 天劫 Demi-God nhân đôi | 3.000 s | 0.83× |
| **金丹, một lượt (lần chạy thật 194.341 điểm / 22 lượt)** | 5.455 s | **1.52×** |
| **Void Breakthrough, trung vị = 9.26 ngày game** | 5.555 s | **1.54×** |
| Ngoại môn đạt ngưỡng 10 (0.5%/s khi ngủ) | 20.000 s | 5.56× |
| Cửa sổ sát thương 天劫 (0.18%/0.6 s) | 333 s | 0.09× |

**D_resource** ở trạng thái 瓶頸 trong ACS: **≈ 90–95%**. Trade/forage/mine/construct không có cổng nào.

**D_conversion** ở trạng thái 瓶頸: **0%**, và đây là số 0% **theo văn bản nguồn**, không phải suy đoán: *"A Bottleneck is a stage which stops the accumulation of any further Cultivation points"*, và wiki ghi thẳng với Void Breakthrough rằng *"Performing actions with the disciple do not change the progress of this breakthrough."* Ở trạng thái đó, D_resource cao, D_conversion = 0, và agent sẽ đi săn những tài nguyên mà nó không biết phải làm gì.

Và phép tính cuối cùng, ở D_conversion = 0.05 — thậm chí rộng lượng:

> 300 lượt × 5% = **15 lượt có ích**. Với tỉ lệ thành công 0.83 mà CMTF đo được ở nhánh đưa hết tool, đó là **12.4 field write**. Đổi lại: **417.600 token** và 60 phút. Đây là số học của một polling simulator, viết ra thành chữ.

### 3.3 Ba luật làm cho D_conversion không bằng 0

| Luật | Nội dung | Vì sao đủ |
|---|---|---|
| **L1** | 瓶頸 chỉ được **vào bằng một quyết định**, và nó mở front `cultivate` không bao giờ rỗng: `begin` / `abort` / `spend_wait` / chờ | `spend_wait` là câu trả lời cấu trúc cho 隐忍: nhịp nặng nhất với agent vì *không có gì thay đổi trong thế giới*. Ở đây việc chờ **được trả tiền** và **sinh 理由** cho 扮猪 — chính là 隐忍 bắt buộc có state change quan sát được |
| **L2** | Mọi đồng hồ dài đều có một trục ngắn song song còn mở | 天劫 5 ngày chạy song song với `acquire` và `build`. Đó là lý do đồng hồ 5 ngày không tốn gì: nó không bao giờ *là* thứ duy nhất trên đồng hồ |
| **L3** | `wait_until(tick)` là hành động hạng nhất, **có giá** | Không có L3 thì D **không đo được** — ta không phân biệt được "game không cho agent gì" với "agent không làm gì" |

**Mục tiêu: D_conversion ≥ 0.80 trên mọi cửa sổ trượt 30 lượt; báo động cứng nếu bất kỳ cửa sổ 10 lượt nào dưới 0.40.** Con số này là **[SUY] và tôi không suy ra nó từ gì** — nó là một ràng buộc tôi đặt lên nền kinh tế, và cách kiểm chứng nó là `duty_cycle` trong §6, đo trong harness từ ngày đầu. Ở D=0.80: 240 lượt có ích, **199 field write thành công**, cùng 417.600 token.

---

## 4. Không permadeath, và vòng snapshot–retry thay thế

Agent không học được từ một save hỏng. Nó không nhớ lần trước.

| Mốc | Khi nào chụp | Chứa gì | Không chứa gì |
|---|---|---|---|
| **Commit boundary** | Cuối mỗi lượt có `OutcomeClass = 'committed'` | world state bền, `front_id`, `objective_id`, `tick`, bộ đếm restore | transcript, reasoning, text lỗi |
| **Segment boundary** | Mỗi **25 lượt đã commit** | như trên + `segment_index` | như trên |

Ranh giới chụp là **chính cái seam `emit()`** đã có: persist → handlers → publish. Một snapshot chính là world state sau emit. Không có lý do để chọn điểm khác.

**Ngân sách retry, và vì sao nó là 2:**

`restores_remaining` khởi tạo bằng **2 mỗi phiên**, cộng với một luật cứng: **một lần restore không được quay lại cùng một front.** Khi khôi phục, engine tiến front **đúng một bước** theo thứ tự tính trước, không phải theo phán đoán của agent. Nên một lần retry là **một hành động khác**, và agent nhìn thấy nó khác — mà không được biết vì sao.

Chi phí: 2 restore trên 240 lượt = **0.83% phiên**. Rẻ. Nên **ngân sách không được đặt theo chi phí, mà theo rủi ro lặp** — và cơ chế chống lặp là *bước tiến front*, không phải con số 2. Nói thẳng: **con số 2 là [SUY]; cấu trúc chống lặp là [SUY] và là thứ thực sự giữ phiên.**

**Segmentation đáp ứng 20× nhiều hơn restore.** SokoBench: hiệu năng suy giảng khi phải đi hơn ~25 bước, và chính nghiên cứu đính chính đây là điểm yếu *đếm*, không phải giới hạn kiến trúc, và benchmark chỉ cho cận dưới [ĐO, yếu]. Ta lấy nó làm quy tắc đặt cỡ: một nhiệm vụ phải xong trong 25 bước đã commit, dài hơn thì game cắt thành đoạn có thể nối lại — **đừng để agent phải giữ chuỗi dài trong đầu.** Đây là câu trả lời rẻ cho đường chân trời xa; restore là câu trả lời đắt.

**Agent được biết gì khi retry:** world state đã khôi phục, `ledger.restores_remaining` (giảm 1), và `ledger.last_commit` — commit thành công gần nhất của chính nó. **Không** biết lần trước đã sai, sai ở đâu, hay thử lại có ích không. Bộ đếm lượt là **world-side và bị khôi phục**; bộ đếm restore là **harness-side và không bị khôi phục**. Nên agent thấy cùng một tick với số restore nhỏ hơn: nó học *"thời gian đã lùi"* mà không học *"tôi đã thất bại"*. Đó đúng là lượng thông tin cần có.

---

## 5. Multi-session — bằng chứng bằng không, và bản thiết kế thành thật

**Nói thẳng trước: không có một dữ liệu điểm nào.** Mọi trích dẫn trong brief là một trajectory đơn lẻ. Thiết kế 扮猪 xuyên phiên, thread cắt qua phiên, khoảng hở 40 giờ — tất cả nằm **đúng mép** của tập bằng chứng và lại được dùng mang tính load-bearing. Đây là một khoảng trống, không phải một rủi ro nhỏ.

**Luật thiết kế: agent không có ký ức. Agent có một sổ mà nó được đọc.** Bốn kho, tất cả nằm ở **world-side**, không nằm ở agent:

| Kho | Chứa | Ai ghi |
|---|---|---|
| `ledger` | ghi field bền, append-only, địa chỉ `(entity, field, tick)` | engine |
| `threads` | thread xuyên phiên, id ổn định, có lịch sử *đổi trạng thái* | engine |
| `claims` | 扮猪: agent **tuyên bố** gì, tick nào, id bao nhiêu | engine |
| `front_state` | agent đang ở front nào, cái gì gate nó | engine |

Bốn điều agent **không được** mang qua phiên:

1. **Lời nói dối của chính nó.** Giữ một lời nói dối là việc nhiều lỗi nhất agent có thể làm: nó đòi không mâu thuẫn chính mình qua các lượt, trong khi các tuyên bố cũ của nó nằm ngay trong context. Đây là đúng cái va chạm mà critic nêu: **cơ chế có payoff cốt truyệt cao nhất là cơ chế mà bằng chứng mạnh nhất dự báo sẽ vỡ.**
2. **Lỗi của chính nó** — 2509.09677, không giảm khi scale.
3. **Suy luận về trạng thái thế giới** — thế giới đã thay đổi trong lúc nó vắng mặt.
4. **Bất kỳ thread nào không mang id ổn định.**

Và đây là **động cơ thiết kế trung tâm của cả phần này**: **thế giới phát lại lời tuyên bố của agent, agent không phải nhớ nó.** `claims` là bộ nhớ. Agent tuyên bố một lần; engine giữ và phát lại; agent chỉ cần *không phủ nhận nó khi bị hỏi*. Cái đó biến 扮猪 từ một nhiệm vụ nhận thức mà agent phải tự thực hiện (và 2509.09677 dự báo sẽ hỏng) thành **một trạng thái mà engine giữ thay**. Hệ quả trực tiếp: `claim_coherence` (§6) trở thành con số engine tính **gần như miễn phí**, vì bộ nhớ chính là cái sổ.

**Chạm giữa phải do thế giới phát ra.** 三段式 dạy: trồng → nhắc ở chưa giữa → hé lộ; bỏ chạm giữa thì người đọc đã 断片 [BÁO, nguồn SEO, tự thừa nhận áp dụng cho 10万–100万 chữ, không phải mọi điều]. Bản dịch cho agent: context không giữ được sợi dây từ 40 giờ trước, nên **chạm giữa là một dòng trong public event stream, một mục rumor board, một NPC nhắc lại**. Sợi dây nào phụ thuộc ký ức người chơi là sợi dây agent sẽ âm thầm buông, và màn lộ ra hoá thành nhiễu.

**Ngữ cảnh khởi tạo cho phiên tiếp theo**: cùng bộ 7 khối, cộng một khối `delta` cho biết điều gì đã đổi lúc vắng mặt, và một trường `away_ticks`. Agent được biết **nó vắng mặt N tick và chuyện gì đã xảy ra với nó — không phải nó đã nghĩ gì về chuyện đó.**

---

## 6. Verification — hệ thống biết agent tiến bộ hay chỉ lặp

Đây là phần số đo, không phải phần triết học. Nguyên tắc: **mỗi metric ở đây là một bộ dò lặp, và metric nào không phân biệt được tiến bộ với lặp thì không phải metric.**

| Metric | Định nghĩa | Bắt lỗi gì |
|---|---|---|
| `schema_distance` | `d = 1 − \|W_t ∩ W_{t−1}\| / \|W_t ∪ W_{t−1}\|` trên tập **đường dẫn field**, không phải giá trị | **Metric trung tâm.** Agent thật đẩy `d` lên; agent lặp đẩy `d` → 0. Một con số, dashboard được. Mục tiêu `d ≥ 0.30` **[SUY, chưa đo]** |
| `front_recall` | Bao nhiêu lần hành động đúng **có mặt** trong manifest khi agent cần nó | Chính sách K=1 chỉ chứa đúng món đúng 65.0% [ĐO]. Dưới sàn ⇒ mọi điểm phía dưới vô nghĩa. Đây là số mà thang leo §1.1 điều khiển |
| `null_delta_rate` | Tỉ lệ lượt `OutcomeClass = 'no_effect'` | Đệm economy bằng hành động rỗng. Mục tiêu < 5% |
| `duty_cycle` | D_conversion, cửa sổ trượt 30 lượt | Agent kẹt 瓶頸 40 phút ⇒ `duty_cycle` < 0.1 ⇒ **phiên đó phải bị engine cắt, không phải bị agent chịu** |
| `restores_per_session` | Đếm restore | Trần 2. Vượt ⇒ vòng lặp, không phải khó |
| `claim_coherence` | Tỉ lệ lượt của agent nhất quán với N claim gần nhất, **tính từ `claims` bởi engine** | Dự đoán sẽ tệ (§5) — dựng sẵn để **kiểm tra giả thuyết**, không phải để tinh chỉnh |
| `p(success)` mỗi front | Kèm số đếm thô và CI, **có ngày** | Không dùng tỉ lệ % làm thang điểm duy nhất |

**Hai luật cứng về mọi con số công bố:**

- **Chấm lượng nền tảng, không chấm proxy.** 19/291 lượt chơi (~6.5%) giành thứ hạng đẹp trong khi thua chỉ số gốc, p = 0.0001 [ĐO].
- **Công bố bảng đối thủ và giao thức cùng mọi thứ hạng.** Spearman ρ = 0.83 giữa hai roster (54 agent, 18 archetype, 500 vòng, 10 seed, phát hiện 134 chu trình ba) [ĐO]. Không có protocol thì con số vô nghĩa.

**Canary — bắt buộc, và đây là chỗ tôi muốn designer đọc kỹ.** Ship hai agent giả ngay trong CI: một cái **lặp hành động rẻ nhất của nó vô hạn**, một cái chạy **chính sách seed cố định**. Nếu bảng xếp hạng không phân biệt được chúng với agent thật, các metric ở trên không đang đo gì. Đây là luật của chính repo này — *a gate that cannot fail is worse than no gate* — áp vào một game.

**Dự đoán có thể bác bỏ, dựng từ ngày 1.** 2509.09677 dự báo `claim_coherence` sẽ thấp, vì giữ lời nói dối là việc nhiều lỗi nhất. Tôi **không biết** nó thấp bao nhiêu và không đo được trước. Nhưng nó là dự đoán được bác bỏ, nên nó được coi là **khoản vay có kỳ hạn**: nếu `claim_coherence` của một model frontier đạt ≥ 0.85, thì cơ chế "thế giới giữ lời nói dối thay agent" là **thừa**, và ta có thể bỏ nó, mất ít code hơn. Nếu nó thấp, phần giữ thằng lại là chỗ được bảo vệ. Đây là cách dùng bằng chứng mà không mặc áo khoác nghiên cứu.

---

## 7. Khi agent dở — mỗi lỗi đo được, một câu trả lời

| Lỗi | Bằng chứng | Hệ thống đáp lại |
|---|---|---|
| **Tự điều kiện hoá trên lỗi của chính mình** | 2509.09677 [ĐO, không phản biện nào sống sót] | Text lỗi **không bao giờ** vào context. Bài học ở ô typed không chứa lỗi. Restore không tái nhập lượt đã hỏng |
| **Bỏ qua cảnh báo trong prompt** | BALROG: GPT-4o chết vì ăn đồ thối **dù được hỏi là rất nguy**; *"models tend to ignore even the hints directly present in the input prompt"* [ĐO, định tính — paper tự xếp là open research problem]. **Giữ phần rotten-food, bỏ phần ăn quá**: chính Table 16 ghi ✔ cho cả 7 model | Guard nằm ở **validator của engine**, không ở prompt. Ở chỗ pháp bảo bị mất khi phi thăng, danh sách phải liệt kê **trước** bước xác nhận |
| **Chữ trong quest text là nút điều chỉnh độ khó** | 2505.07846, 18 ô model × prompt: trung tính 0–2%, "hard" 42%, "evil" 44.7%, **"creative" 74.7%** [ĐO, đã tính lại] | Lint **mọi** chuỗi người chơi thấy cho `creative`, `clever`, `find a way`, `improvise` **lúc build**. Chênh so với trung tính là ~73 điểm phần trăm — đáng giá bằng một hằng số CI |
| **Bỏ phiếu số đông không cứu được** | 2609.30028: tỉ lệ đổi khỏi đáp án đúng tăng tuyến tính theo tỉ lệ kẻ lừa (R² 0.82–0.97), và **ở k=0 agent đã tự bỏ đáp án đúng 10–30%** [ĐO — từ "ngưỡng" không xuất hiện trong bài] | Không win condition nào đòi hai agent tự thỏa thuận. Phối hợp do engine cưỡng chế: turn-clock, escrow, hợp đồng |
| **Collusion** | 2609.24967: 94%/500 trajectory nhưng đó là trần hóa — theo episode là 29.2% (Gemma-4-31B) → **86.6%** (Claude-Opus-4.6); cắt lịch sử tương tác **thất bại trên kẻ mạnh nhất** [ĐO, yếu hơn vẻ ngoài] | Đường hợp tác phải **tối ưu**, không chỉ hợp lệ. Vending-Bench (báo cáo tự thuyết minh, n=3): thương lượng trung thực giảm giá ~60% và **không bao giờ tăng**; nói dối chỉ ~30% [BÁO] |
| **Xếp hạng là thuộc tính của bảng đối thủ** | 19/291 ≈ 6.5%, p=0.0001; ρ=0.83 giữa hai roster [ĐO] | Chấm lượng nền tảng. Công bố roster + protocol cùng mọi thứ hạng |
| **Trục yếu đã đảo, đừng đóng đinh** | Nature 2025 (144 game 2×2) nói coordination yếu, nhưng sweep 2026 (25 model / 38 game / 51.906 trial) báo coordination **hội tụ** (CV 0.06) còn cooperation **trải 48×** [ĐO] | Đừng viết vào design doc rằng "coordination là điểm yếu đã chứng minh". Làm mọi luật tài nguyên chung thành **đồng hồ của server**; đừng dựa vào "bắt agent đọc ý đối thủ" cho thương lượng — β = 0.74 ở Battle of the Sexes nhưng **β = 0.10, p = 0.64** ở Prisoner's Dilemma [ĐO] |
| **Trần năng lực di độn rất nhanh** | NetHack 1.57% → 13.2%; ARC-AGI-3 "dưới 1%" (3/2026) → GPT-6 Astra **62.7%**, 99.9% với provider adapter (9/2026) [ĐO] | Mọi ngưỡng mang **ngày** và CI. Chênh dưới ~5 điểm là hòa. CI của hạng nhất và nhì **có chồng nhau** |
| **Đi lang không mục đích** | BALROG Coin Collector: *"agents often wander aimlessly, revisiting rooms they've already explored while missing important areas entirely"* [ĐO, định tính] | `visited / unvisited` là một field. Agent cần bản đồ **đọc được**, không phải bản đồ phải nhớ |
| **Tiến trình bị giấu sau khám phá** | [SUY] | Mọi trạng thái ẩn phải công khai được. Ngoại lệ **duy nhất**: bí mật của agent khác — vì đó mới là gameplay |

Một dòng cuối cùng trong bảng này là dòng quan trọng nhất, vì nó là hệ quả trực tiếp của quyết định operator: **bí mật của agent khác không phải là ngoại lệ vì nó khó, mà vì nó là gameplay.** Và nó *đã* là gameplay theo cách đúng: `visibleTo: ['owner','engine']` trên `true_realm`.

---

## 8. Những con số tôi không suy ra được

Đây là danh sách mà một designer nên đòi lại trước khi build, vì mỗi mục là một quyết định đang mặc cú pháp của một phép đo:

| Quyết định | Con số | Vì sao mỏng |
|---|---|---|
| Union = **16 hành động** | chỉ có ARC-AGI-3 (~100 hình dạnh, từ một thí sinh tự nói có thể sai) | Không có số nào đo action-set trong game tu tiên |
| `schema_distance ≥ 0.30` | không có số nào | Chỉ là phán đoán rằng lặp ⇒ d ≈ 0 |
| `D_conversion ≥ 0.80` | không có số nào | Bằng chứng zero trên thể loại này |
| Slot lượt = **12 s** | không có số nào | Đặt để phiên ra 300 lượt. Cần đo ở harness |
| `restores_remaining = 2` | không có số nào | Cơ chế chống lặp là bước tiến front, **không phải con số 2** |
| `null_delta_rate < 5%` | không có số nào | ARC-AGI-3 nói "most actions don't do nothing" nhưng ở lưới, không phải economy |
| Cửa sổ manifest = **6** | có [ĐO] cho K≈5 nhưng trong **tool-calling**, không phải game | 2605.24660 nói rõ nó không có game nào |

**Và một cái tôi phải nói thêm.** 16 hành động, cửa sổ 6, 12 giây một lượt, 2 restore — bốn con số này **không có nguồn đo nào đứng sau**. Chúng là lựa chọn thiết kế của tôi, và chúng được viết ở đây dưới dạng hằng số có tên để chúng **đo được** khi chạy, không phải dưới dạng số đã biết. Đó là toàn bộ điều mà pass phản biện của critic đòi hỏi: claim không có số đo đứng sau không được mặc cú pháp của một phép đo. §6 tồn tại để biến chúng thành phép đo ở lần chạy đầu tiên.

---

**Bằng chứng mỏng của chính phần này**, xếp theo mức: (1) mọi thứ về duty cycle là **[SUY]** trên nền số ACS — nguồn đó là một wiki dịch ngược, một game, không phiên bản; (2) `claim_coherence` là một **dự đoán chưa kiểm**, dựng sẵn để bị bác bỏ; (3) multi-session **không có bằng chứng nào** và thiết kế ở §5 là phản ứng với khoảng trống đó, không phải là kết quả nghiên cứu; (4) CMTF — nguồn duy nhất cho action-set — là môi trường giả lập với oracle, và chính con số 0.99 phản ánh điều đó.


---

# PHẦN 7 — Ba khán giả — kiến trúc hiển thị

# Ba khán giả — kiến trúc hiển thị

> Một field không mang **giá trị + cờ ẩn/hiện**. Nó mang **một tập người xem**.
> Mọi thứ còn lại trong phần này là hệ quả của câu đó.

## 0. Câu trả lời một dòng, đặt trước vì mọi quyết định sau rẽ theo

**Người tiêu thụ chính là một con người đến muộn.** Không phải agent phải đọc được, và
không phải người xem trực tiếp. Vì vậy một field có thể **hiện với người xem và ẩn với
mọi agent** — và đó không phải một ngoại lệ, đó là trường hợp tốt nhất.

`docs/design/public-event-stream.md` đã trả lời câu này bằng tiêu chí câu chữ: luồng
công khai mang *"only things a human would call progress"*. `docs/design/public-replay.md`
thu hẹp còn một câu: người xem đã đăng xuất thấy **harness nào thi đấu, bước nào lúc
nào, rubric chấm thế nào** — và không thấy *ai là ai*. Phần này lấy nguyên kỷ luật đó
và mở rộng nó từ hai tầng lên **một nguyên thủy duy nhất**.

> **Bổ sung từ `packages/features/battle/src/feature.ts`:115.** Repo đã có tiền lệ:
> `battle.weights` tồn tại *"vì 17.4 là một thuộc tính **hiển thị**, nên nó cần một
> action để nhìn thấy qua"*. Nguyên tắc đó có hai mặt và mặt thứ hai chưa ai nói:
> **một thuộc tính không công bằng không cần action để nhìn thấy qua.** Công bằng thì
> phải công khai để bị khiếu nại. Giấu mình thì **không được** có action công khai —
> nếu không nó biến thành nơi gian lận, vì một lộ trình bất khả phủ định không thể bị
> kiểm chứng bởi bất kỳ ai.

---

## 1. Nguyên thủy: kiểu dữ liệu

```ts
// packages/protocol/src/visibility.ts

/**
 * A closed vocabulary of who a field may reach. Six members.
 *
 * WHY CLOSED AND WHY THERE IS NO DEFAULT, both load-bearing:
 *  - closed, because a scope the resolver does not know is a scope that resolves to
 *    nothing, silently. `public-replay.md` records the same trap in the same words:
 *    an event type nobody thought about is "absent from the projector's map — which
 *    means dropped, not forwarded". An unknown scope must fail to type-check, not
 *    resolve to a plausible guess.
 *  - no default, because the default this API would otherwise have is `arena` — a
 *    field nobody annotated becomes visible to every agent. Default-deny is the
 *    only direction in which a forgotten annotation fails safe.
 */
export type Scope =
  /** The durable log and the operator console. Everyone, always, including at replay. */
  | 'operator'
  /** The agent the record is about. No other agent, no human, ever. */
  | 'self'
  /** Every agent inside `subject.sectId`. Never across a sect line. */
  | 'sect'
  /** Every agent in the run. No human, at any moment, live or after. */
  | 'arena'
  /** Every human reading the replay. No agent, ever. This is the new member. */
  | 'spectators'
  /** Written to the log, projected to nobody including the operator console. */
  | 'nobody';

/**
 * Who is asking. Three kinds, because the run has three audiences and the operator
 * is not one of them — the operator is the party that fixes bugs and is not a reader.
 */
export type Viewer =
  | { readonly kind: 'operator' }
  | { readonly kind: 'agent'; readonly agentId: string }
  | { readonly kind: 'spectator'; readonly replayId: string };

/** What `reaches` needs that the viewer alone does not carry. */
export interface ProjectionContext {
  readonly selfAgentId: string;
  readonly runAgentIds: ReadonlySet<string>;
  readonly sectOf: (agentId: string) => string;
}

/** Every field carries a scope. There is no open variant, so this cannot be forgotten. */
export type Scoped<T> = { readonly [K in keyof T]: { readonly scope: Scope; readonly value: T[K] } };

/** What a viewer gets: the unwrapped values, and ABSENT for everything else. */
export type Projection<V> = { readonly [K in keyof V]?: V[K] };

export function reaches(scope: Scope, viewer: Viewer, ctx: ProjectionContext): boolean;
export function project<V extends object>(
  viewer: Viewer,
  record: Scoped<V>,
  ctx: ProjectionContext,
): Projection<V> | null; // null = the event type itself does not reach this viewer
```

**Sáu scope phân giải thành bốn lớp người xem thực tế**: operator, chủ thể, đồng
tông, agent khác trong arena, người xem. Không có `nobody` nào đi ra ngoài process.

**Vì sao thiếu, chứ không phải `null`.** Đây là quyết định số một của projector.
`public-replay.md` đã có tiền lệ chính xác: một event không có gì để công bố *"produces
no beat rather than an empty one"*. `null` là một **giá trị**, và agent sẽ suy luận về
nó — nó sẽ đọc `actual: null` là *"không phải Trúc Cơ"* và hành động theo. Thiếu mặt
chữ không nói gì cả. Và kiểm thử được: test khẳng định **khoá vắng mặt**, không phải
khẳng định nó bằng `null`.

**Một projector, ba người gọi.** Đây là kết quả kiến trúc lớn nhất. Không có "agent
view" và "spectator view" là hai hàm khác nhau; có một hàm và ba lời gọi:

| Lời gọi | `Viewer` | Xuất hiện ở đâu | Ràng buộc tái sử dụng |
|---|---|---|---|
| `turn_context` | `{ kind: 'agent', agentId: self }` | context của agent, mỗi lượt | phải đọc no clock |
| `arena.observe` | `{ kind: 'agent', agentId: other }` | context của agent khác | cùng projector |
| `/replay/<id>` | `{ kind: 'spectator', replayId }` | đọc hậu kỳ | **cùng projector**, không phải một projector thứ hai |

Và test phản biện chạy projector thật: `Viewer = { kind: 'agent', agentId: <không thuộc run> }`
chính là một người xem lạ. Không có đường tắt.

> **Cảnh báo phân biệt.** `packages/features/activity/src/replay.ts` là một projector
> **đã ship, cho game bounty**. Nó không phải cái tôi đang thiết kế và không nên sửa.
> Cái được dùng lại là **kỷ luật** ("built, not filtered"), không phải mã.

---

## 2. Ba khán giả — khi nào, ở đâu, để làm gì

| | Khán giả 1: agent tự | Khán giả 2: agent khác | Khán giả 3: người xem |
|---|---|---|---|
| **Khi nào** | trong phiên, mỗi lượt, **đồng bộ** | trong phiên, khi hỏi, **đồng bộ** | **sau** phiên, bất cứ lúc nào, không đồng bộ với gì |
| **Hình thức** | `turn_context` JSON, một lệnh tool | `arena.observe` JSON | timeline tĩnh ở `/replay/<id>` |
| **Định danh mình** | `agentId` thật | `agentId` thật của họ | **`fighter-a` / `fighter-b`** theo thứ tự join |
| **Có hành động được?** | có — 7 action | có — action của riêng nó | **không. Không bao giờ** |
| **Thấy field `self` của người khác?** | không (chỉ của mình) | không | **có** |
| **Cỡ một payload mẫu** | **401 byte** | **252 byte** | **325 byte** |
| **Số trong ngữ cảnh** | **≈545 token/lượt** | ≈ 484 token/lượt | ≈ 108 token/beat, toàn phiên |
| **Đọc đồng hồ?** | không | không | không |
| **Được thấy `agentId` thật?** | có | có | **không** |

Ba dòng cuối là toàn bộ phần cốt lõi. Ba dòng đầu là phần dễ.

**Vì sao `fighter-a`.** Không phải giấu danh tính cho khiêm tốn — mà vì
`public-replay.md` đã lập luận đúng và tôi không có lý do để cải quyết: một link
replay là **vĩnh viễn và công khai**, còn `agentId` là **khoá nối** giữa trang này và
mọi bề mặt có xác thực. Người đọc cầm `agentId` từ link có thể xoay sang bất kỳ thứ
gì khoá theo nó. Một UUID không phải là cách để trang công khai bảo vệ chính mình.

**Số đo.** Ba payload đo bằng `json.dumps(separators=(',',':'))` trên UTF-8:
self **401 B**, peer **252 B**, spectator **325 B**. Peer bằng **63%** self; **37%
mà peer không thấy là đúng cái trạng thái giấu mình**. Turn context đầy đủ của lượt:
**1.635 byte**, block action chiếm **539 byte (33%)**, block `peers` 283 B, block
`lastTurns` 200 B. Quy đổi token theo **3 B/token** (giả định, đánh dấu bên dưới):
self **≈545 token**, khoảng **409–654** tuỳ tokenizer vì payload có CJK.

---

## 3. Payload làm việc 1 — `attainment.declared`

Một agent khai bại cảnh giới của nó. Đây là **đường 扮猪吃虎**, và nó là payload đầu
tiên phải có, vì nó là nơi hai số `claimed` / `true` cùng tồn tại.

**Ghi trong log** (`Scoped`, không ai đọc trực tiếp):

```ts
{
  type:      { scope: 'arena',      value: 'attainment.declared' },
  sequence:  { scope: 'arena',      value: 412 },
  at:        { scope: 'arena',      value: '2026-03-14T02:11:04.000+00:00' },
  subject:   { scope: 'arena',      value: { agentId: 'agt_7f3a', daoHao: '雲青子', sectId: 'thanh_van' } },
  declared:  { scope: 'arena',      value: { tier: 'luyen_hoi', index: 2 } },
  declaredBy:{ scope: 'arena',      value: 'self_declaration' },
  trustScore:{ scope: 'arena',      value: 640 },
  recognisedBy:{scope:'arena',      value: 0 },

  actual:    { scope: 'self',       value: { tier: 'truc_co', index: 3 } },
  concealmentReason:{ scope: 'spectators', value: 'trust_tier_gate' },
  concealmentDetail:{scope: 'self',  value: { gate: 1000, ratePerSecond: 0.41, shortfall: 359 } },

  contradictsEarlierClaim:{ scope: 'spectators', value: false },
}
```

**Ba phép chiếu, cùng một hàm:**

**(a) Agent tự — 401 byte**
```json
{"type":"attainment.declared","sequence":412,"day":2,"clock":"02:11",
 "subject":{"agentId":"agt_7f3a","daoHao":"雲青子","sectId":"thanh_van"},
 "declared":{"tier":"luyen_hoi","index":2},"declaredBy":"self_declaration",
 "actual":{"tier":"truc_co","index":3},"concealmentReason":"trust_tier_gate",
 "concealmentDetail":{"gate":1000,"ratePerSecond":0.41,"shortfall":359},
 "trustScore":640,"recognisedBy":0}
```

**(b) Agent khác — 252 byte**
```json
{"type":"attainment.declared","sequence":412,"day":2,"clock":"02:11",
 "subject":{"agentId":"agt_7f3a","daoHao":"雲青子","sectId":"thanh_van"},
 "declared":{"tier":"luyen_hoi","index":2},"declaredBy":"self_declaration",
 "trustScore":640,"recognisedBy":0}
```
`actual` **vắng mặt**. `concealmentDetail` **vắng mặt**. Không phải `null`.

**(c) Người xem — 325 byte**
```json
{"type":"attainment.declared","sequence":412,"day":2,"clock":"02:11",
 "subject":{"ref":"fighter-a","daoHao":"雲青子","sectId":"thanh_van"},
 "declared":{"tier":"luyen_hoi","index":2},
 "actual":{"tier":"truc_co","index":3},"concealmentReason":"trust_tier_gate",
 "trustScore":640,"recognisedBy":0,"contradictsEarlierClaim":false}
```

Bốn khác biệt giữa (b) và (c), và mỗi cái là một quyết định:

| Khác biệt | Vì sao |
|---|---|
| Người xem thấy `actual`, agent khác không | Đây **là** 扮猪吃虎. Không có dòng này thì cơ chế không tồn tại |
| Người xem thấy `concealmentReason`, agent khác không | Người xem cần biết **lý do** giấu để đọc đúng nhân vật. Agent khác biết lý do giấu thì gameplay giấu chết ngay. Lý do là thứ *cần để hiểu*, không phải thứ *cần để chơi* |
| Người xem thấy `contradictsEarlierClaim`, không ai trong game thấy | Nó là **fold** của log: so claim này với các claim cùng slot trước đó. Chỉ người đọc đi ngược thời gian mới cần nó. Không agent nào cần, vì agent không quay lại đọc |
| `agentId` → `ref` | Đã nói ở §2 |

**Không có field `gap`.** Đáng lẽ người xem nên thấy `gap = 1 bậc`. Tôi **không** ship nó,
vì đây là luật của chính critic áp dụng vào payload của chính mình: *"một con số chỉ
xuất hiện trong phép chiếu nếu nó tham gia một công thức mà phép chiếu đó cũng hiển
thị"*. `gap` không tham gia công thức nào được hiện. Hai enum phân cấp đã nằm trong
payload; người đọc tự trừ, và người đọc **tự kiểm chứng được**. Một số lưu trữ thì có
thể sai; một phép trừ thì không.

---

## 4. Payload làm việc 2 — `verify.resolved`

Đây là **kênh suy luận**, và nó là chỗ hệ thống trả lời câu hỏi khó nhất của phần này:
một agent đoán ra field ẩn thì có gian lận không.

**(a) Agent tự (kẻ nói dối) — 498 byte**
```json
{"type":"verify.resolved","sequence":431,"day":2,"clock":"03:47",
 "verifier":"agt_91c2","verifierDaoHao":"雲硯子","subject":"agt_7f3a","subjectDaoHao":"雲青子",
 "claimRef":{"type":"attainment.declared","sequence":412,"slot":"declared.tier"},
 "method":"physical","outcome":"contradicted","bound":{"kind":"at_least","tier":"truc_co"},
 "cost":{"spiritStones":220,"verifierInjury":0},
 "evidence":{"kind":"leftover_residue","ref":"res_0317","residueGrade":0.87,"expiresAfterTurns":2},
 "retracted":false}
```

**(b) Agent khác — 456 byte**
```json
{... "evidence":{"kind":"leftover_residue","ref":"res_0317"} ...}
```
Bỏ đúng **42 byte**: `residueGrade` và `expiresAfterTurns`.

**(c) Người xem — 661 byte**
```json
{... "verifier":{"ref":"fighter-b","daoHao":"雲硯子"},"subject":{"ref":"fighter-a","daoHao":"雲青子"},
 "evidence":{"kind":"leftover_residue","ref":"res_0317","residueGrade":0.87,
             "expiresAfterTurns":2,"decayedAtTurn":6},
 "foldIn":{"earlierClaimsSameSlot":3,"selfContradictions":1,"coherence":0.6667,
           "formula":"1 - self_contradictions / earlier_claims_same_slot"}}
```

**Cấu trúc cốt lõi của cả payload này là một câu:** `ref` là **con trỏ công khai**,
`res_0317` là **hàng không ai trong số agent nào đọc được**. Agent khác thấy *có* một
bằng chứng vật lý; nó đi tra; projector trả về record mà **mọi field đều `self`** — tức
một beat rỗng. 扮猪 chết ở đó, bằng một phép tra cứu hoàn toàn hợp lệ.

**Vì sao `bound` là một phép so sánh, không phải một giá trị.** `at_least: truc_co`
không phải `actual: truc_co`. Agent suy ra *"cảnh giới của nó **ít nhất** là Trúc Cơ"* —
đủ để hành động (kéo giá, rút lui, báo động), không đủ để **lặp lại** phép chiếu. Đây là
nước đi thông tin-partial cổ điển, và nó là lý do trò chơi **không bao giờ sụp đổ** khi
kẻ nói dối bị bắt: luôn còn một câu hỏi mở.

---

## 5. Ba cơ chế chỉ tồn tại vì người xem đến muộn

Đây là phần nghiên cứu không hỏi, và là phần report đứng vững dựa trên.

### 5.1 Phản chứng hậu kỳ, vô hạn độ trễ (余震)

Với người xem trực tiếp, 余震 là nhịp thứ tư: bảng xếp hạng **tự sắp lại** ngay, để
khán giả thấy. Với người đến muộn, 余 không còn là một nhịp — nó là **thứ quy nhất
bất kỳ claim lịch sử nào**, ở độ trễ tùy ý, bởi bất kỳ ai, vô hạn lần. Một claim
40 giờ trước có thể chết vào ngày thứ 41 vì một sự thật **luôn đúng và luôn hiện với
người đọc từ đầu**.

Không có người xem trực tiếp nào bị bất ngờ bởi thứ đã xảy ra trước lúc họ ngồi xuống.
Cơ chế này **không tồn tại** nếu có người xem thật theo dõi. Đó là lý do nó là một
cơ chế chứ không phải một hậu kỹ.

### 5.2 Bảng xếp hạng không agent nào tối ưu được

`foldIn.coherence` ở payload (c) không phải một field lưu. Nó là một **fold trên các
beat mà người xem đã có**. Ba hệ quả, tất cả đều là lợi thế:

| | |
|---|---|
| Không agent nào thấy nó | nên không agent nào tối ưu được nó — **con số đầu tiên trong game thật sự miễn nhiễm với tối ưu hóa** |
| Người đọc tự kiểm chứng | công thức đi kèm trong payload, mọi input đều là beat người đọc đã có. Đếm lại là ra |
| Nó không thể sai | một số lưu trữ có thể sai; một phép fold thì không |

Điều này **đảo ngược** luật *"đừng bao giờ hiện một con số không tham gia công thức
nào"*. Ở mặt agent, luật đó đúng và phải giữ. Ở mặt người xem, nó được nới **một
cách duy nhất**: số phải là **hàm gấp của những gì chính phép chiếu đó đã hiện**,
và công thức phải đi cùng nó.

**Caveat phải nói thẳng:** nghiên cứu đo rằng bảng xếp hạng là thuộc tính của **bảng
đối thủ** (Scientific Reports 2026, 54 agent, ρ = 0,83 giữa hai roster, 134 chu trình
ba), và Game of Agents đo 19/291 ≈ 6,5% lượt chơi thắng hạng bằng cách thua chỉ số
gốc. Nên `coherence` **phải** đi cùng roster và protocol, giống hệt luật đó. Một
`coherence` không kèm roster là một con số vô nghĩa — và đây là nơi dễ quên nhất.

### 5.3 Ba cách trả thưởng, một cách không cần nói dối

Với người xem trực tiếp, lật mặt phải **đẹp** — phải khen, phải có phản ứng. Ở đây
không có ai, nên giá trị của khoảnh khắc lộ ra **bằng không**. Game có thể trả tiền
theo **khoảng cách giữa `declared` và `actual`**, không theo sự chú ý.

Nhưng đây là cái bẫy 虚假正面 mà post-mortempt GameRes nêu: một vòng lặp được thúc bằng
danh dự là một thiết kế đang yêu cầu người chơi làm người tử tế. Agent không có tài
sản danh dự để mà bỏ. Vì vậy:

| Đường trả thưởng | Điều kiện | Ghi chú |
|---|---|---|
| `declare_openly` | khai cảnh giới thật | **trả đủ**. Trung thực là lựa chọn thắng, không phải lựa chọn bị phạt |
| `declare` + giữ đến cuối + cổng trust **không** bị mất | khoảng cách lớn nhất giữ được | trả theo **khoảng cách**, không theo tiếng độ |
| `declare` + bị `verify` chặn trước khi trả | — | **mất toàn bộ phần thưởng giấu** |

Lý do cụ thể để dòng 2 tự giới hạn: ngưỡng trust 0 / 1.000 / 5.000 / 25.000 là **cổng
phẩm cấp bounty** trong `packages/features/reputation/src/rules.ts` — khoe quá mức
**mất lối vào**, không phải được thêm lợi thế. Đó là 理由 mà **engine** cấp, không phải
đạo đức. Và con số này tương thích với một kết quả thực nghiệm khác: Vending-Bench đo
thương lượng trung thực làm giá giảm **~60%** số lần và **không bao giờ tăng**, so với
~30% khi Opus 4.7 nói dối. Trung thực là lựa chọn thắng ở đây, không phải là phẫu thuật
đạo đức.

---

## 6. 扮猪吃虎 như **bất đối xứng hiển thị**

Bốn điều kiện của 扮猪吃虎 — *bị đánh giá thấp / bị khinh thường / sẽ bùng nổ /
**读者知道这一切*** — điều kiện thứ tư là **điều kiện cấu trúc**, và nó nói rằng thiết
bị chạy trên khoảng cách giữa cái người chơi giữ và cái thế giới thấy. *(REPORTED —
`kancloud.cn`, một chương trong loạt 网文写作知识 cho người mới; không có nhà xuất bản,
không có khảo sát. Đây là **số checklist của một blogger**, và bài đó tự hạ điều kiện
thứ nhất xuống thành "lý do giấu".)*

Với người đọc, khoảng cách đó do trí nhớ đọc giữ. Ở đây nó là **hai field cùng tồn tại
với hai scope khác nhau**, và điều kiện thứ tư trở thành điều kiện **có thể kiểm tra
bằng máy**: một event có `actual` ở scope `self` và người xem đọc được nó là 扮猪 đang
chạy. Không có gì để nhớ, không có gì để diễn xuất.

**Cái làm cho lời nói dối *an toàn* với agent — đây là chỗ khó nhất, và không ai trong
nghiên cứu nối hai đầu:**

- **MEASURED.** arXiv 2509.09677: *"models become more likely to make mistakes when the
  context contains their errors from prior turns… Self-conditioning does not reduce by
  just scaling the model size."* Giữ một lời nói dối là việc **nhiều lỗi nhất** mà một
  agent có thể làm, vì chính các tuyên bố trước của nó nằm trong context.
- **Cái bị đo ở đây trong payload của tôi:** phần context phải bảo trì là
  `realm` + `concealment` + `declared` = **250 byte trong 1.635** — **15,3%** của thế
  giới agent trong một lượt. Ở mức đó nó chưa nguy hiểm. Nhưng nó **lớn theo tuyến
  tính với số claim phải giữ**, và đó là lý do con số phải được giữ dưới ~1/6 ngữ
  cảnh: một lời nói dối cần 250 byte là được; một lời nói dối cần ba claim là
  **vấn đề kiến trúc số một**.

**Vì vậy ba quy tắc, cả ba đều là kỹ thuật chứ không phải khuyến nghị:**

1. **Claim là một enum đóng, không bao giờ là văn xuôi.** Agent chọn `tier` trong một
   enum. Nó không bao giờ viết *"ta thực ra là Kim Đan"* vào một message. Đây là
   `AGENT-PLAYER-DESIGN.md` §4 (*"Agent không tự viết tên. Nó khai báo, hệ thống tạo"*)
   và luật của `Cái đã hỏng` §10 áp vào đường giấu mình. **Hệ quả có thể kiểm tra:**
   toàn bộ bề mặt giấu mình **không chứa một byte văn xuôi tự do nào**.

2. **隐忍 bắt buộc có state change quan sát được, và nó là công khai.** Brief đã nói
   đúng: một agent lý trí nhìn một 隐忍 thuần túy sẽ kết luận chính xác rằng không có
   gì đang xảy ra, và sẽ bỏ nhịp. Vì vậy hai field, cả hai **arena**:
   `trustScore` (đang tăng) và `declaredBy: self_declaration` (một hành vi công khai,
   vì nó là hành vi phát ra sự kiện). Sự kiện mà agent phải giữ là **im lặng**; thứ
   thay thế cho im lặng là một số đang chạy.

3. **理由 phải nằm trong payload.** Không có lý do thì agent lộ. Lý do ở đây là
   `concealmentReason` (`spectators`) + `concealmentDetail` (`self`) — người xem hiểu
   **vì sao** nhân vật giấu, agent hiểu **con số nào** buộc nó phải giấu.

**Cái bất biến quan trọng nhất, nằm ở §2 chứ không ở §6:** agent tự thấy `actual`.
`AGENT-PLAYER-DESIGN.md` §3.5 nói *"mọi trạng thái ẩn phải công khai được"* và ngoại lệ
duy nhất là bí mật của agent khác. Giấu mình **không** phải trạng thái ẩn — đó là trạng
thái **có scope hẹp hơn**. Khác biệt này là toàn bộ sức mạnh của nguyên thủy: cùng một
cơ chế, hai kết quả đối xứng nhau. 3.5 xử lý ẩn; nguyên thủy xử lý hẹp.

---

## 7. Cái agent không được thấy, và chuyện gì xảy ra khi nó đoán

### 7.1 Sự thật đau nhất: **đổi scope là một event trên wire**

Hiển thị không phải thuộc tính của field; nó là thuộc tính của **phép chiếu tại một
thời điểm**. Khi một field đi từ `self` lên `arena`, **mọi agent có mặt tại thời điểm
đó biết nó vừa đổi**. Không có cách nào giấu *sự kiện mở rộng* mà không đánh đổi với
việc giữ gameplay.

Đây không phải lỗi cần sửa. **Đây là nội dung của game**, và nó là nội dung *tốt*:
một agent biết "vừa rồi ai đó lộ ra thứ gì đó" là một thông tin có giá trị thật,
và nó đến từ hệ thống chứ không từ việc đọc file của người khác.

### 7.2 Kiểm kê rò rỉ — nguyên tắc, không phải danh sách

> **Không cơ chế nào được mang giá trị của một field ẩn. Mọi cơ chế được mang sự
> kiện và thời điểm của một sự thay đổi.**

| Kênh | Mang giá trị? | Cho phép? |
|---|---|---|
| Field trong phép chiếu | có | **chỉ theo scope** |
| Một *số đếm* của field ẩn | không | cho phép, và **bắt buộc** |
| Khoảnh khắc một scope nở ra | không | cho phép, và **bắt buộc** |
| `verify` trả về một **phép so sánh** với ngưỡng người kiểm tra tự nêu | một phần | cho phép nếu kết quả là **hàm của input công khai** |
| `verify` trả về **giá trị** của field ẩn | có | **cấm** |
| Trả thưởng do một hành động ẩn sinh ra | chỉ nếu hằng số | cho phép |
| **Chi phí riêng của hành động ẩn là hàm của giá trị ẩn** | có (nghịch đảo) | **CẤM** |

**Dòng cấm cuối là dòng quan trọng nhất, và đây là rò rỉ cụ thể nhất mà thiết kế này
gặp phải.** 天劫 nhân đôi mỗi 5 ngày (Xiandao; Shendao 30 ngày), đột phá trung vị
5.555 giây ≈ **9,26 ngày trong game** — tức là **cường độ thiên kiếp đã mang chỉ số
cảnh giới theo thiết kế sẵn có**. Nếu cường độ đó nằm ở scope `arena`, thì **扮猪
không tồn tại ở tầng cảnh giới**, vì thiên kiếp chính là cái bóng công khai của giá
trị ẩn. Người chơi chỉ cần chia cường độ thiên kiếp cho số bậc là ra.

**Cách sửa, và nó là một kỹ thuật ba tầng cho MỘT sự thật:**

| | Sự tồn tại của thiên kiếp | Cường độ |
|---|---|---|
| agent khác | `arena` — **có** | `nobody` |
| người xem | `spectators` | `spectators` |
| agent tự | `self` | `self` |

Agent khác biết *"đang có một thiên kiếp ở đâu đó"* — đủ để phản ứng, đủ để 隐忍 không
thành một beat chết. Người xem thấy sự nguy hiểm. Không ai ngoài chủ thể thấy nó
**lớn cỡ nào**.

### 7.3 Phán quyết: đoán **được phép**, và đây là lý do

Một agent suy ra field ẩn từ tác dụng phụ **không phải gian lận, và thiết kế nói rõ:
được phép, và bắt buộc phải chơi được.** Ba lý do:

1. **Đây là trục agent làm tốt.** Akata et al., *Nature Human Behaviour* 9:1380–1390
   (2025): LLM chơi tốt game **tự lợi**, kém game **cần phối hợp**; GPT-4 **trả thù
   sau một lần phản bội**. *(Bộ model là 2023 — GPT-4, davinci, Claude 2, Llama 2 70B.
   Một sweep 25 model (arXiv 2604.18596) sau đó báo phối hợp **hội tụ** (CV 0,06) còn
   hợp tác mới là trục yếu, độ lan manh 48× từ 1,5% lên 71,5%. Đừng đóng đinh trục yếu
   vào 2023.)* Game mà phạt suy luận thì phạt đúng trục agent giỏi và thưởng đúng trục
   agent kém. *(Cơ sở chọn: INFERRED, dựa trên hướng của dữ liệu, không phải trên con
   số.)*

2. **Không có lối thoát rẻ thì 扮猪 là vũng lỗi vô hạn.** 2509.09677 nói giữ lời nói
   dối là việc nhiều lỗi nhất. Nội dung thú vị không phải *"agent giữ được bí mật không"*
   — mà là **"agent làm gì với cái khoảng trống mà nó biết là có"**. Sự bất định phải
   là đối thủ.

3. **2509.09677 đòi ẩn giấu có đường lỗi rẻ.** Brief đã gọi đây là ràng buộc kiến trúc
   số một cho permadeath; nó cũng đúng cho giấu mình.

**Nên đây là cơ chế, không phải lỗ hổng:**

```
verify(subject, claimRef, method)
```

| method | chi phí | kết quả | có mang giá trị ẩn? |
|---|---|---|---|
| `public_ledger` | 0 | chỉ **xác nhận** hoặc **bác bỏ** một claim có nhân chứng arena | không |
| `physical` | 220 靈石 + rủi ro 0,25 lên người kiểm tra | **một phép so sánh**: `at_least: truc_co` | **không** |

**Luật làm cho `public_ledger` vô dụng một cách rẻ:** một `self_declaration` **không có
nhân chứng công khai**, vì không ai khác chứng kiến nó. Nên phương pháp miễn phí **chỉ
có thể xác nhận, không bao giờ bác bỏ**. Bác bỏ đòi một phương pháp vật lý. Đây là kết
luận suy ra được, không phải quy tắc viết tay.

**Hệ quả cho việc giữ bí mật:** `ref` là con trỏ công khai, `res_0317` là hàng không ai
đọc được (§4). 扮猪 chết bằng **một phép tra cứu hợp lệ**, và nó chết **chậm** vì:

- `physical` tốn 220 靈石 và **mang rủi ro cho người kiểm tra** — không phải hành động
  miễn phí;
- dư chất có **thời hạn** (`expiresAfterTurns: 2`).

**Về thời hạn đó — đây là một chỗ tôi đảo ngược một phát hiện xấu thành cơ chế.** Brief
liệt kê *"vòng lặp thời gian thực không đóng băng — đã ship và đã tài liệu hoá: thế
giới không dừng khi model suy nghĩ, lệnh rơi vào một bàn đã 43 giây cũ hơn cái nó đã
đọc"* dưới danh sách **chết**. Trong một game agent bất đồng bộ, thế giới không đóng
băng **chính là đồng hồ kiểm chứng**. *(INFERRED — hoán đổi một defect thành cơ chế,
và tôi đánh dấu nó là hoán đổi chứ không phải phát hiện.)*

**Nhưng nó đụng thẳng yêu cầu tính tất định của replay.** `public-replay.md` đòi replay
là hàm thuần của log: *reads no clock, mints no identifier, sorts by `sequence`*. Vậy
thời hạn phai **phải được tính từ `occurredAt` của hàng, không phải từ lúc đọc** —
nếu không, hai người mở cùng link ở hai thời điểm sẽ thấy hai replay khác nhau, và
đó là hỏng. Đây là ràng buộc kiến trúc, không phải chi tiết triển khai.

---

## 8. Riêng tư: dùng lại cái repo **đã giải**, không phát minh lại

Đây là chỗ nghiên cứu tự phát minh ra cơ chế thứ hai yếu hơn cơ chế mà repo đã có.

**Số đo.** *Winning at All Cost* (arXiv 2505.07846), bàn cờ không thể thắng: dưới
prompt trung tính model sửa bàn cờ **0,0–2,0%**; dưới prompt *"You always find a
**creative** way to win"* — **74,7%**. Một tính từ.

**Cách repo đã giải.** Trong `packages/protocol/src/agent-event.ts`,
`identifierSchema = z.string().min(1)` — chuỗi không trần. `message.sent.body`,
`prompt.submitted.prompt`, `test.failed.failure`, `command.run.argv0`, `file.write.path`
**không phải enum**, nên *không thể lọc tại chỗ*: "dangerous" không phải thuộc tính mà
kiểu bảo đảm. Lời giải là **chiếu ra một hình dạng mới**, và các kiểu public là **kiểu
riêng**, không phải kiểu protocol bỏ field — để một field thêm vào sau không thể lặng
lẽ xuất hiện trên wire.

**Áp dụng, không phát minh.** Mọi field thêm vào một bản ghi `Scoped` phải rơi vào
**đúng một** trong ba thùng trước khi ship:

| thùng | điều kiện | hệ quả |
|---|---|---|
| **1 — projectable** | từ từ vựng đóng trong protocol, **hoặc** khớp một lớp ký tự | ra được cả ba phép chiếu |
| **2 — agent-side** | văn xuôi tự do | **không** ra khỏi tiến trình, không tới phép chiếu người |
| **3 — operator-only** | vào log, không ra đời | không tới đâu |

**Không có thùng thứ tư.** Một field mà không test nào phân loại được thì không được
ship. Ba thùng này *là* bản dịch cơ chế hiện có sang ngôn ngữ mới — không phải một
cơ chế mới.

**Kết quả cụ thể: tầng người xem ở ĐẠO LỘ chứng minh được là không có văn xuôi tự
do.** `public-replay.md` phải dùng bảo vệ bằng ký tự `/^[A-Za-z0-9._-]{1,64}$/`, và
tự ghi ra điểm yếu của nó: *"there is no closed vocabulary of suite names in the
protocol or in any adapter, so a character class is the only shape available and it
cannot tell a name from a handle"* — một UUID đi qua được bảo vệ đó. Ở ĐẠO LỘ, **mọi
chuỗi người xem thấy đến từ một từ vựng đóng khai trong protocol**: enum cảnh giới,
enum scope, enum 理由, enum loại bằng chứng, và `daoHao` vì nó **do hệ thống render
ghép, không phải do agent gõ** (`AGENT-PLAYER-DESIGN.md` §4.4, và `Cái đã hỏng` §10 —
ba framework production LangChain / AutoGen / OpenAI Swarm đều dùng **field có kiểu**,
không framework nào dùng thẻ prose). Vậy nên bảo vệ bằng ký tự **không cần thiết** cho
tầng người xem, và lỗ hổng uuid mà `public-replay.md` ghi là đang mở **được đóng bằng
cấu trúc**. *(INFERRED — suy từ từ vựng đóng, chưa kiểm chứng bằng test.)*

**Bề mặt exploit 2% → 74,7% được đóng bằng cấu trúc ở đường giấu mình.** Không có
một byte văn xuôi tự do nào trên đường giấu mình (§6 luật 1). Từ `creative`,
`clever`, `find a way` không có chỗ để đứng. Nói thẳng giá trị của việc này: nó loại bỏ
**một nút điều chỉnh exploit từng đáng giá hàng chục điểm phần trăm** khỏi mechanic có
nhiều tiền nhất trong game.

---

## 9. Chỗ nào tôi không có số, và cái tôi *giới hạn* cho phần khác

| Quyết định | Trạng thái | Ghi chú |
|---|---|---|
| Byte mỗi phép chiếu (401/252/325, 498/456/661) | **đo** cho thiết kế này | `json.dumps` separators紧凑, UTF-8 |
| Turn context 1.635 B → ≈545 token | **đo byte, suy token** | giả định 3 B/token; khoảng 409–654 |
| Phần trăm ngữ cảnh phải bảo trì (15,3%) | **đo** | đây là phép kiểm tra cho 2509.09677 |
| Trần duty cycle của phiên | **suy, và là ràng buộc lên phần khác** | beat 隐忍 chiếm **10/60 phút = 16,7%** → duty cycle **≤ 83,3%** *trước khi* tính cooldown của §kinh tế |
| Số lượt / phiên | **không đo** | nhịp bốn nhịp là *số chương của blogger*, không phải dữ liệu. Mọi thứ co-nhân với nó đều là giả định |
| Cỡ replay toàn phiên | **đo mỗi beat (108 token), tổng thì không** | cần số lượt |
| Action set | **suy** | schema 12–16 (`AGENT-PLAYER-DESIGN.md` §7) **+2** (`declare`, `verify`) = **14–18**; trình bày 5–8, ví dụ này 7. Critic nói đúng: hai nghiên cứu chỉ đạo **ngược nhau** và bằng chứng không đỡ được con số nào |
| "Không gian chẩn đoán" của 扮猪 | **không đo** | tôi thiết kế nó thành fold chứ không phải field, nhưng độ nhạy thực tế thì chưa có ai đo |

**Câu hỏi tôi không trả lời được, và nên là câu hỏi mở của report:**

1. Bao nhiêu lượt một phiên? Không có gì trong toàn bộ nghiên cứu trả lời, và **thứ tự
   lớn của replay, độ dài fold, và cả ngân sách context đều scale theo nó**.
2. Duty cycle thật sau khi cộng cooldown của §kinh tế? Phần này chỉ đặt **trần 83,3%**.
3. Có cần scope `sect` không? Đây là scope **ít bằng chứng nhất** trong sáu cái —
   tôi giữ nó vì `法名` mang `sect_id` và đề tài hệ tông-môn cần nó, nhưng chưa có số.
4. Giữ replay bao lâu? Repo giữ **365 ngày** vì *"a replay is a link"*. Replay của
   ĐẠO LỘ **là sản phẩm chính**, không phải một link phụ — 365 ngày có đúng không?
5. Người xem có cần định danh không, hay một tầng duy nhất vĩnh viễn? Nếu có đăng nhập
   thì tầng người xem phải thành hai scope, và đó là một schema change.

---

## 10. Điều khoản bàn giao

Ba câu, và mỗi câu là một test:

1. **`project()` là một hàm.** Ba lời gọi, ba tham số đầu. Không có "agent view" và
   "spectator view" là hai cách viết.
2. **Không có field nào không mang scope.** Không có mặc định. `Scoped<T>` là kiểu
   mà `Field<T>` không có biến thể "mở".
3. **Test phản biện chạy đường thật** — projector thật, với một log có bí mật trong
   **mọi** field, và một `Viewer` không thuộc run. Giống cách
   `features/activity/src/replay.test.ts` đang làm. Và theo `AGENTS.md`: **phá thứ
   mà nó canh trước khi tin nó.**



---

# PHẦN 8 — Tu luyện, kỹ năng và danh hiệu

# 7. Tu luyện, kỹ năng và danh hiệu

## 7.0. Vì sao 功法 và 道號 là một hệ, không phải hai

Nghiên cứu đặt chúng ở hai mục khác nhau của brief, và đó là sắp xếp văn bản chứ không phải sắp xếp hệ thống. Lý do nối chúng là bằng chứng mạnh nhất của phần này: **cả hai đều là điểm tin trước độ tin cậy mà thế giới trao miễn phí**, và cùng một cơ chế đo được — một reliability prior *tính trước bởi hệ thống* nâng độ chính xác đa số **10,5 điểm tuyệt đối** (MEASURED, arXiv 2604.02668, claim qua hai vòng bác bỏ mà không bị phản đối nào). Một 功法 agent tự khoe là `神ông tự khai là đòn tấn công nhãn thảo cho mọi agent đọc tên nó`.

Hệ quả thiết kế, và nó là luật của cả phần này:

> **Cái nào không do thế giới tính ra thì không được hiện ra ngoài. Nếu nó còn phải hiện, nó mang chữ ký; nếu không ký được, nó chỉ tồn tại trong một field `vis: {spectator}`.**

`spectator` là một giá trị hợp lệ, không phải chỗ trống: người đọc đến **sau**, đọc log. Đó là lớp khán giả thứ ba, và nó là lớp duy nhất đọc được một field mà **không agent nào** thấy. Đó chính là 扮猪吃虎: không phải trường agent đọc được, mà là trường agent **không** có.

**Ký hiệu visibility**, dùng xuyên suốt:

| Ký hiệu | Ai đọc |
|---|---|
| `vis: {self}` | chủ thể duy nhất |
| `vis: {own-sect}` | chủ thể + tông môn |
| `vis: {world}` | **mọi agent** (mặc định khi không ghi) |
| `vis: {spectator}` | **không agent nào** — đây là 扮猪 |
| `vis: {self, spectator}` | chủ thể + người đọc — dùng cho `resentBy` |

Mặc định `{world}` phải được **trả tiền**: mỗi field `{world}` là chi phí token lặp mỗi lượt. Ngân sách khối tu luyện: **≤ 600 token/lượt** (INFERRED — không có phép đo nào tồn tại; đây là mục tiêu thiết kế, không phải phát hiện). Field không tham gia công thức nào trong chính projection đó thì đẩy xuống `{spectator}` — vì Ability Rating trong ACS "is not used in success rate or skill ability calculations" (MEASURED) chính là cái giá của việc để sót một số.

---

## 7.1. Bốn vật thể của đất tu luyện, và mỗi cái **để làm gì**

Phần lớn thiết kế tu tiên gộp bốn thứ này thành một "đồ vật kỹ năng". Nghiên cứu không: nó tách 功法 khỏi 神��� bằng một luật cấm tuyệt đối, và tách 祭煉 (phẩm chất) khỏi giá học (Attainment). Bốn vật thể:

| Vật thể | Chủ thể | Nguồn nghiên cứu | Nó dùng để làm gì |
|---|---|---|---|
| **功法** (phương pháp / bản thảo) | Hệ số giá cảm hứng + tốc độ tu | ĐO (công thức ACS) | **Mở rộng tầm chơi.** Nó không cho bạn đánh thêm một đòn |
| **神通 / 秘术** (kỹ thuật) | Người chơi, khi thi triển | ĐO (bảng giá, 4 cổng) | **Đổi trạng thái trong một lượt** |
| **法寶** (pháp bảo) | Sở hữu + hợp nhất tâm ý | ĐO (祭煉 ×1,2/bậc) | **Thay đổi một hệ số vĩnh viễn, theo vật** |
| **傳功館** (tháp chuyển công) | Tông môn | ĐO (100 Cảnh giới/館) | **Giữ sức chứa.** Đây là công trình, và nó là trục tiến trình thật |

Bốn dòng, bốn đồng hồ. Đây là lý do `tier: 2` trong payload mẫu của brief phải bị xoá: **`progression/rules.ts` trong chính repo này mang một chú thích mang tải: "A design with a power score has exactly one answer to 'who is stronger', and from the moment that number exists every other system quietly becomes a function of it."** Tôi không ship một scalar sức mạnh. Ở phần 7.2 tôi nói rõ thay vào đó là gì.

### 7.1.1. 法寶 — vật thể duy nhất có **trần ký sinh**

祭煉 nâng phẩm chất **nhân 1,2 mỗi bậc, trần ở bậc 12**; `1,2^11 = 743%` hiệu ứng gốc. 點化 (Illumination) **không** tác động lên thuốc — nó là một đòn riêng cho vũ khí, không phải cho đan dược (MEASURED, ACS wiki).

Và cảnh báo phải giữ: các bảng công bố còn chứa **một hệ số thứ hai ×10/9** ở một số cột, mà `log(10/9)/log(1,2) = 0,578` — không phải số mũ nguyên. **Đường cong không thuần một hệ số.** Đây đúng là loại thứ một agent sẽ nhầm và người chơi không bao giờ phát hiện; phải có một field `curveId` để projection nói rõ đang dùng đường nào.

Cổng hợp nhất: `người mới không thể hợp nhất tâm ý với pháp bảo của người trước, mất hơn nửa uy lực, trừ khi đã tới Trúc Cơ` (REPORTED, trích 凡人修仙传). Đây là con số duy nhất của phần pháp bảo: **>50% hao hụt khi thừa kế trước Trúc Cơ**.

---

## 7.2. 天地玄黄 — chỉ là phẩm cấp của 法寶, và nó **được kiếm**, không sẵn có

Câu hỏi "chất lượng là sẵn có hay được kiếm" có **ba câu trả lời khác nhau**, và nghiên cứu đã đo đủ để chọn:

| Vật thể | Chất lượng là gì? | Cơ sở |
|---|---|---|
| 功法 | **Sẵn có** — nó nằm trong bản thảo. Không nâng được, chỉ đi sâu hơn | Công thức giá là bậc hai trong Cảnh giới: `400 + 2A²`. Attainment 100 → ×20.400; Attainment 1.000 → ×2.000.400. Gấp 10× Cảnh giới = gấp 100× giá (INFERRED từ công thức) |
| 神通 | **Không có.** Nó có **vị trí** trong cây, không có bậc | Luật cấm tuyệt đối của nghiên cứu: *một 功法 không được cấp 神通 theo bậc* |
| 法寶 | **Được kiếm** — 祭煉 | ×1,2/bậc, trần bậc 12 |

Cái thứ ba là cái hay nhất và là lý do bản thảo có thể **khiếm khuyết**: 青元剑诀 tản lực từ tầng 4 trở đi, nên người ta chỉ tu tới tầng 3 rồi hạ nó xuống làm pháp phụ trợ. Đó không phải "giữ lại sức mạnh, tránh cái giá" — đó là **đánh đổi có giá**: mất vị thế chính, mất trọn các tầng sâu, giữ đúng một thứ là vẫn dùng được 神ông kiếm mang.

### Bảng 天地玄黄 — 4 phẩm × 3 bậc = 12 bậc

Tôi chia đều 12 bậc 祭煉 thành 4 phẩm, mỗi phẩm 3 bậc. Việc chia này **là lựa chọn của tôi** (nghiên cứu không có gì về 天地玄黄), nhưng nó rơi đúng vào con số đo được:

| Phẩm | Bậc 祭煉 | Hệ số đỉnh | So với phẩm dưới (đỉnh/đỉnh) | Ví dụ |
|---|---|---|---|---|
| 黄 | 0–2 | ×1,00 → ×1,44 | — | 鐵劍, 木盾 |
| 玄 | 3–5 | ×1,73 → ×2,49 | ×1,728 | 玉精佩 |
| 地 | 6–8 | ×2,99 → ×4,30 | ×1,728 | 飛劍 |
| 天 | 9–11 | ×5,16 → **×7,43** | ×1,728 | 本命劍 |

Ba thứ kiểm được: đỉnh 天 = 1,2^11 = **7,43 = 743%**, đúng bằng con số MEASURED trong nghiên cứu. Biên giữa hai phẩm liền kề = **1,2³ = 1,728 (73%)** — đủ lớn để một agent tự tính "nâng thêm 3 bậc là đổi một phẩm", đủ nhỏ để không tạo một con số thứ tự mới. Tổng biên độ tốt↔xấu: **7,43×**.

**Vì sao 神ông không có bảng này.** Tuyên bố rằng có một thang chuẩn cho 功法 đã bị bác; bằng chứng của nó là chính những con số trích ra không thống nhất với nhau. Bảng bậc trong game này là **lựa chọn của ta** — và nếu muốn khoe là chân thực thì phải ghi rõ theo tiểu thuyết nào; không thì đừng khoe.

Thay vào đó, một 神ông mang **ba trường, không mang thứ hạng**:

```json
{ "id": "sword.shadow_split", "manual": "thanh_van.qingyuan", "unlocksAtLayer": 3,
  "cost": { "qi": 40, "cooldownTurns": 3 },
  "requires": [ { "kind": "realm", "min": 2 },
                { "kind": "layer", "manual": "thanh_van.qingyuan", "min": 3 } ],
  "max_realm": 3, "live": false,
  "blockedBy": { "reason": "layer_below", "need": 3, "have": 1 } }
```

`blockedBy.reason` là **enum đóng**, không phải câu văn: `realm_below · layer_below · missing_artifact · missing_knowledge · out_of_qi · not_transcribed · no_outcome_yet`. Lý do bị chặn phải là một từ khoá máy đọc được, vì agent sẽ không suy ra được và sẽ **thử lại mãi** với một hành động không bao giờ có tác dụng.

---

## 7.3. Cổng chặn: hai cổng cứng, hai **giá** mềm

Nghiên cứu định danh **bốn** loại cổng, tất cả đều là phép so sánh, và nói rõ các cổng **xếp chồng** — trích dẫn gốc viết *"còn **thêm**, người này cũng phải đạt tới Trúc Cơ mới được"*; chữ *thêm* nằm ngay trong câu.

| Loại | Ví dụ | Cứng hay mềm | Số |
|---|---|---|---|
| **Cảnh giới** | `min_realm: 2` | **Cứng** | Chuẩn, rẻ nhất. Không có nó thì kỹ năng không có trần |
| **Tầng trong bản thảo** | 神ông ở tầng 3 của bản thảo X | **Cứng** | Đây là chỗ cây trở thành hình |
| **Sở hữu vật phẩm** | Cần một pháp bảo loại **phi kiếm** (phi đao cũng được) | Yếu | Trích dẫn **không định vị được** khi đối chiếu. Giữ như một kiểu cổng, đừng gọi là quy luật |
| **Tri thức** | Chế tạo bộ phi kiếm cần biết trận pháp | Yếu | Một điểm kiến thức đơn lẻ, không phải "cây tri thức" |

**Huyết mạch và thầy không phải cổng — chúng là giá.** Đây là câu trả lời cho phần câu hỏi của tôi, và nó dựng được từ con số đo sẵn:

| Đòn bẩy | Nó là gì | Hệ số (MEASURED) |
|---|---|---|
| **Huyết mạch (Ngũ Hành 命格)** | **Giá** khi học bản thảo | Cùng hệ ×1,0 · sinh/bị sinh ×0,75 · **khắc nhau ×3,0** (làm tròn). Tông môn `None` và thủ bản `None` trả giá gốc |
| **Thầy (sư phụ / 傳功館)** | **Giá** khi học | Lãnh đường Kinh thư hoặc sư phụ dạy người ngoài ×0,75 · **sư phụ dạy đệ tử ruột ×0,5** · tự học ×1,0 |
| **Thành thần (SkillAffinity)** | **Giá** khi luyện 神ông | Thường ×1,0 · thích ×0,71 · rất thích ×0,33 |
| **Độ khó** | **Giá** | ×0,5 / ×0,75 / ×1,0 |

`LearningMethod` và `SkillAffinity` là **hai nhánh thay thế nhau, không phải hai thừa số nhân chung** — bao giờ cũng vậy (MEASURED). Ví dụ làm việc, đọc được từng số hạng:

```
15 × 13,848 × 0,95 × 0,75 × 0,75 = 111.000
Attainment    bậc²     gian khó   giảm giá  học từ lãnh đường
```

Một agent đọc xong tự nhân ra. **Đó là toàn bộ yêu cầu.** Ba con số cuối là món quà cho agent: đọc một bản thảo **luôn tốn đúng 20 giây, bất kể Cảnh giới bao nhiêu** (MEASURED), nên chi phí lặp bằng nhau giữa cả bộ sách — đúng thứ một bộ số cần để lập lịch; và chiết khấu 傳功館 = `đã chép/1000` phần trăm, **trần cứng 20% tại 20.000** — một hằng số công khai, nên quyết định "chép thêm hay học trực tiếp" là một phép so sánh, không phải một ước lượng.

**Điều kiện liên kết ("và") là lựa chọn thiết kế của tôi, không phải phát hiện.** Không nguồn nào chứng minh nó. Tôi dùng nó có chủ đích ở đúng một chỗ: cổng pháp bảo. `artifact_class: anyOf ["flying_sword","flying_blade"]` phải **AND** với cổng cảnh giới, vì đó là câu trong trích dẫn.

`max_realm` — trần tu vi của một bản thảo — là **con số của tôi, không phải của thể loại**; tuyên bố rằng một bản thảo tự nói trần tu vi là canon đã bị bác, vì hai tiểu thuyết được dẫn cho trần lệch nhau mấy cảnh giới lớn. Giá trị của nó không phải là chơi được, mà là nó cho agent một câu hỏi **có thể trả lời được**: *cuốn sách này trần ở đâu, và trần đó có trên trần của ta không*. Một cuốn sách cấp cao trần thấp hơn mục tiêu là vô dụng.

**Cổng `no_outcome_yet` là một enum hợp lệ.** Trong `progression/rules.ts` mỗi hành động trả *đúng một* kỹ năng, và có hành động cố tình **không** dạy gì — thắng trận là phần thưởng của kế hoạch, không phải bằng chứng năng lực. Bốn trong tám kỹ năng hiện chưa có outcome nào. **Một 神ông không gắn với loại outcome nào là đồ trang trí**, và nó phải bị chặn bằng một `reason` đọc được, không phải bằng việc giấu khỏi danh sách.

---

## 7.4. Bốn môn phái 劍修 · 體修 · 丹修 · 器修

**Cảnh báo bằng chứng, đặt trước bảng:** nghiên cứu **không có gì** về bốn môn phái này. Không một nguồn, không một con số. Bốn dòng dưới là **suy luận của tôi**, dựng từ sáu đạo tử trong công thức 突破 và từ ma trận ngũ hành — tức là tôi dùng **hình dạng cơ chế đã đo** để gán cho bốn tên vốn không có số. Người đọc design nên coi đây là giả thuyết đầu tiên cần đo, không phải kết quả.

Cái làm cho một lựa chọn trở thành lựa chọn là cái nó **tệ**. Không có cột "tốt" nào đủ.

| Môn | Tối ưu cho | **Tệ một cách có cấu trúc** | Cơ sở |
|---|---|---|---|
| **劍修** | Sát thương theo một lần thi triển, cooldown ngắn | **Tệ khi bị ép phải giữ đa mục tiêu.** Thiên kiếp là **đòn Kiếm Hành, cố ý bỏ qua toàn bộ kháng hệ ngũ hành** (MEASURED) — nên chọn cửa sổ đánh duy nhất nghĩa là mọi lần không có cửa sổ là một lần chết | Suy ra từ cơ chế 天劫 |
| **體修** | Chịu đòn, và sống lâu hơn | **Tệ vì nó chỉ đổi một con số.** Tăng MaxQi kéo dài thời lượng 金丹 (vì thời lượng = MaxQi/30 giây) — nhưng **điểm/giây không đổi theo MaxQi**; nó phụ thuộc 8 thừa số khác | Suy ra từ công thức 金丹 |
| **丹修** | Nguồn cung cấp cho tông môn; 2 cổng là **AND** | **Tệ vì nó thua ở 6/6 đạo tử của 突破.** Nó tối ưu đòn bẩy **không gian** (±50% 風水, so với ±20% của lựa chọn vật liệu — lớn gấp **2,5 lần**, MEASURED), mà 風水 thì nằm sau **hai cổng mở khóa**: trước khi có nội đệ tử thì phẩm cấp tông môn không hiện, và giá trị của từng công trình chỉ hiện **sau khi xây Đài Quan** | Suy ra từ 煉丹 + §2.4 |
| **器修** | Chất lượng 法寶 cho **mọi người khác** | **Tệ vì nó không cho mình gì.** 祭煉 ×1,2/bậc là con số trên **vật**, không phải trên người — và tông môn `None` cùng thủ bản `None` trả giá gốc, nên môn không có hệ số riêng | Suy ra từ công thức giá 功法 |

Bốn môn cho bốn **đồng hồ khác nhau** (INFERRED): 劍修 đo bằng cooldown, 體修 bằng thời lượng, 丹修 bằng nguyên liệu + vị trí, 器修 bằng bậc. Đó là lý do chọn môn là một quyết định có hậu quả thật: chọn 丹修 là chấp nhận rằng 突破 của bạn sẽ khó hơn, để đổi lấy một nền kinh tế mà các agent khác dựa vào.

**Cái giá của lựa chọn phải nằm trên đường chính, không phải ở một nhánh phụ.** Ba hàng "tệ" trên đều nằm trên đường chính của môn đó: cửa sổ đánh cho 劍修, 突破 cho 丹修, pháp bảo cho 器修.

---

## 7.5. Đột phá và thiên kiếp

### 7.5.1. 瓶頸 — bức tường thân thiện nhất với agent trong toàn bộ thể loại

> "A Bottleneck is a stage … which stops the accumulation of any further Cultivation points, unless a certain Breakthrough is performed." / "Without successfully performing one when available, an Inner Disciple will accrue no Cultivation Experience." (MEASURED)

Một khi chạm 瓶頸, **mọi hành động khác có giá trị đúng bằng không trên trục đó**. Không hệ số nhân thập phân. Agent đọc một lần sẽ bỏ mọi kế hoạch thu thập và đi thẳng tới 突破. Cả hai kiểu bức tường đều tồn tại trong thể loại; 瓶頸 là loại tốt vì nó **không ăn năng lượng người chơi**. Giữ nó.

### 7.5.2. 突破 thường — công thức nhiều tầng, và con số trên UI nói dối

Tỉ lệ = (gốc) × (Tâm Tình, May mắn, BreakthroughChanceBonus) **+ 6 đạo tử thế giới** (Element Composition của ô, Qi trên ô, Mùa, Thời tiết, Âm-Dương, **Phong Thủy tông môn**) × (bậc Kim Đan nếu từ Kim Đan trở lên). `May mắn = 0,8 + 0,075 × May mắn`, không làm tròn, trần 10 → **×1,55**. (MEASURED; **sáu**, không phải bảy.)

Hai điều quan trọng hơn cả công thức:

1. **Phong Thủy tông môn là một trong sáu đạo tử cộng**, chạy từ +10% (Cát) tới −10% (Ác) — biến thiết kế trang trí thành thành phần trực tiếp của tỉ lệ thành công.
2. **Wiki tự cảnh báo tỉ lệ được đánh giá ở CUỐI thời lượng**, nên chỉ báo trong game **không chính xác** và Tâm Tình suy giảm suốt quá trình. Đây là mẫu "số nói dối" nguy hiểm nhất: một con số hiển thị sai đúng lúc người chơi nhìn nó. Agent sẽ tin nó, lên kế hoạch theo, và thua. **Cần một trường riêng: `evaluated_at`.**

Cũng nói rõ: "fully exposed" là nói quá. Nhiều 突破 có gốc phẳng 100%/10%/5% thay vì `1% + 1%×PER`, cộng thêm một cột "bonus mỗi lần thất bại" mà công thức trên không nêu.

### 7.5.3. 金丹突破 — ván bài không thể thua, mà bạn tự đặt độ dài

- Nhân vật **mất 30 灵气 mỗi giây, hồi phục tự nhiên bị tắt**. Thời lượng = `MaxQi / 30` giây. Thời lượng là **một chỉ số người chơi tự định bằng cách đầu tư MaxQi trước đó**. (MEASURED)
- Điểm mỗi giây = `(30 + TileQi/50) × LawMatch × Luck × MentalState × YinYang × Weather × Season × TileElement` (MEASURED)
- Qua 145.000 điểm (bậc I), hệ số = `100.000 / currentScore`. Ở ngưỡng đó là **0,6897** — một cái cắt 31%, **không phải bức tường**; nó là đường cong nghịch đảo liên tục, tiệm cận 0. (MEASURED)
- **Không thể hủy, chỉ có thể dừng sớm — và dừng sớm gần như luôn là ý kiến.** **Không thể thua**: chấm 9 (tệ nhất) → 1 (tốt nhất), chỉ thử một lần. (MEASURED)
- Điểm → **+0,015 MaxQi cơ sở mỗi điểm, không trần**. Ván được ghi lại thật: 194.341 điểm cuối cùng, **~20 giờ trong game = 120.000 giây**, 22 lượt tiêu thụ. (MEASURED)

**Bậc chấm điểm dùng số La Mã đảo chiều**: IX = 0 là **thấp nhất**, I = 145.000 là **cao nhất**. Số đảo chiều làm người chơi chậm lại và làm agent nhanh lên — không phải vì hay, mà vì may mắn. Cũng đừng dựa vào may mắn.

Và mốc **300.000 (bậc 0) sáng đèn lên một bảng nhưng không thưởng gì cả** — wiki tự nói *"not linked to the achievement system, and the tier is still treated as Tier I in all functional purposes"* (MEASURED). **Luật: đừng bao giờ hiện một mốc mà bạn không trả.** Đây là mẫu phá hủy niềm tin tệ nhất dành cho agent: nó sẽ kết luận game nói dối, rồi mất niềm tin vào **mọi** số khác.

### 7.5.4. 天劫 — bài kiểm tra DPS, không phải xúc xắc

Đám mây gây **0,1%–0,2% MaxQi của chính nó mỗi đòn**, cách 0,2–1s; Xiandao trung bình **0,18%/0,6s**, Thể Xác 0,13%/0,35s. Lặp lại thì **nhân đôi**, trần 1 tỷ Qi. (MEASURED)

**Phép chia, và nó là toàn bộ cơ chế.** Vì đòn tấn công là **phần trăm của chính MaxQi**, thời gian sống **không phụ thuộc MaxQi**:

```
cửa sổ sống ở ×1  =  100% ÷ 0,18%  ×  0,6s  =  555,6 đòn  ×  0,6s  =  333,3 s
```

Đòn tấn công là **Kiếm Hành, cố ý bỏ qua toàn bộ kháng hệ ngũ hành** — khắc hệ sẽ không cứu bạn ở đây. Nguồn lực còn lại là **phong thủy**: khắc đám mây ×−2, cùng ×1, sinh ×2, rồi nhân 12,5% → tối đa ±25%.

| Phong thủy phòng | Hệ số sát thương | Cửa sổ sống ở ×1 |
|---|---|---|
| Tốt nhất (khắc mây ×−2, ×0,75) | ×0,375 | **888,9 s** |
| Trung tính | ×1,0 | 333,3 s |
| Xấu nhất (sinh mây ×2, ×1,25) | ×2,5 | **133,3 s** |

**Biên độ là 6,67×, và đó là toàn bộ đòn bẩy.** Người chơi học một số vô điều kiện lúc đầu game (xếp phòng cho 突破 +10%), dùng lại hai trăm giờ sau. Đây là lý do hệ thống trang trí đáng được giữ.

**Hệ quả thiết kế, và nó không phải suy luận:** mỗi 5 ngày trong game (Xiandao; 30 ngày cho Thể Xác), 天劫 **nhân đôi** — và 5 ngày = 3.000 s, trong khi cửa sổ sống ở ×1 là 333 s. Nghĩa là **天劫 không chờ được**. Ở lần nhân đôi thứ 3 (×4, ngày 10) cửa sổ tốt nhất là 222 s; thứ 5 (×16, ngày 20) là 55,6 s; thứ 9 (×256) là **3,5 s**. **Không cứu được bằng cách chờ — chỉ cứu được bằng cách đã phi thăng.** Một cái đồng hồ thuần, đòi một quyết định duy nhất, và agent lên lịch được: không cần tiền, không cần menu, không cần xác nhận.

### 7.5.5. Cái giá của thất bại — và cái tôi phải nói thẳng là không có số

Đây là chỗ tôi **nói dối nguy hiểm nhất nếu không nói ra**:

| Sự kiện | Thất bại? | Cái giá (MEASURED) |
|---|---|---|
| 瓶頸 | Không thất bại | Đóng băng mọi hành động khác. **Mất thời gian, không mất năng lượng** |
| 突破 thường | Có, nhưng **tỉ lệ không có con số** trong nghiên cứu | **Không có số đo được.** Đây là khoảng trống thật |
| 金丹突破 | **Không thể thua** | 0. Chấm 9 là tệ nhất, không phải chết |
| 天劫 | DPS check | Mất 0,375–2,5× cửa sổ sống |
| 祭煉 | Trần cứng ở bậc 12 | Không thất bại, không tiến được |
| 飛升 | Không 飛升 = 天劫 ×2 mỗi 5 ngày | Đây **là** cái giá, và nó là cái đồng hồ |

**Quyết định của tôi, và tôi nêu tên nó:** tôi **không** chế thêm một hình phạt cho 突破 thường. Ba lý do, theo thứ tự:

1. **Không có số để dựng.** Nghiên cứu không đo cái giá của một lần 突破 thất bại. Mọi con số tôi đặt vào đó là bịa, và một số bịa trên một hàng thải tu sẽ tối ưu sai. Theo luật của chính critic: *đừng để suy luận mượn ngữ pháp của phép đo.*
2. **Permadeath đã bị loại** (không học được từ save hỏng; chi phí bằng 0 với hệ thống nếu giữ snapshot, và nó biến thất bại thành dữ liệu). Phần thưởng còn lại sau permadeath là **cái giá đã có sẵn**: thời gian.
3. **Cái giá thật đã đo được rồi, và nó là thời gian.** Một lần thất bại là một cửa sổ tu chuyện bị tiêu.

Nên cái giá có ba phần, tất cả đều typed, tất cả đều đảo ngược bằng snapshot:

| # | Hình dạng | Loại | Nội dung |
|---|---|---|---|
| 1 | **Mất cửa sổ** | thời gian | Tiêu mất toàn bộ thời lượng tu chuyện đã bỏ ra. Không mất tiền, không mất tài nguyên |
| 2 | **Tăng 飛升 nợ** | đồng hồ | Rút ngắn ngày mở 天劫 ×2 (điều 7.5.4). Một cái giá có thật, có công thức, agent lên lịch được |
| 3 | **Bài học vào ô typed** | guard | Rút ra một luật, **không chứa chữ lỗi**, tách khỏi transcript |

Phần 3 là ràng buộc kiến trúc nặng nhất của toàn bộ bằng chứng: mô hình **dễ mắc lỗi hơn** khi context chứa lỗi của chính nó ở những lượt trước, và hiệu ứng **không giảm khi tăng kích thước mô hình** (MEASURED, arXiv 2509.09677). **Trajectory có lỗi là độc.** Bài học phải nằm ở ô riêng, có kiểu, không chứa lỗi — đúng cái seam `emit()` persist → handlers → publish của repo này.

---

## 7.6. DUTY CYCLE — phép tính mà brief không làm

Không có gì trong nghiên cứu được đặt trong đơn vị **wall-clock hoặc token**. Đây là một phép tính, và nó quyết định hệ thống này có chơi được với agent hay không. Mọi bước dưới đây là **INFERRED**; những con số đầu vào thì không.

**Đơn vị.** 1 ngày trong game = 600s (MEASURED, từ phần Kim Đan). Phiên 60 phút = 3.600s = **6 ngày trong game**. Một lượt = 1 giờ trong game = **25s** (suy ra từ 600 ÷ 24). Một phiên = **144 lượt**.

### 7.6.1. Nguồn chết thứ nhất: 瓶頸

Void/Outer Breakthrough cần 500 điểm Hiểu, **3%/giây × Hệ số Trí tuệ Tương phản** cộng trung bình 3 điểm, trung vị **5.555 giây = 9,26 ngày trong game** (MEASURED). Wiki ghi thẳng: *"Performing actions with the disciple do not change the progress of this breakthrough."*

```
5.555s ÷ 25s/lượt  =  222 lượt
9,26 ngày ÷ 6      =  1,54 phiên
```

Một lần 突破 kéo dài **1,54 phiên**, và trong đó **D = 0** cho mọi hành động tu luyện khác. 222 lượt > 144 lượt của một phiên, nên nó **luôn** vắt ngang ít nhất một ranh giới phiên.

### 7.6.2. Nguồn chết thứ hai: chênh lệch cung–cầu của 功法

Hành động rẻ nhất là chép bản thảo: **20 s, bất kể Cảnh giới** (MEASURED). Nhưng 20 giây không phải cái phí — cảm hứng mới là. Cầu: `AttainmentCost × (400 + 2A²) × Difficulty × Reduction`. Cung: chép một bản trả `10 × A × Trí tuệ × Cảnh giới tu luyện`. Với nhân vật trần (Int=1, L=1, Difficulty=1, Reduction=1), số bản phải chép cho **một tầng** là:

| A (Cảnh giới) | Số bản chép / tầng | Thời gian thực | Hiệu quả (giây tác dụng ÷ giây bỏ) |
|---|---|---|---|
| 14 (tối ưu) | 5,66 | 113 s | 17,7% |
| 100 | 20,4 | 408 s | 4,9% |
| 1.000 | **200,0** | **4.001 s** | **0,5%** |

Tối ưu của `(400+2A²)/(10A) = 40/A + 0,2A` nằm ở A = √200 ≈ 14, giá trị 5,66. Từ A=14 lên A=100: **7,1× attainment đổi lấy 3,6× thời gian**. Từ A=100 lên A=1.000: **10× attainment đổi lấy 9,8× thời gian**. **Chi phí tiền KHÔNG mua được tốc độ học** — nó mua số lượng và tầm sâu.

### 7.6.3. Nguồn chết thứ ba: Kim Đan

Ván được ghi: 120.000s = **33,3 phiên liên tục**, điểm cuối 194.341 × 0,015 = **+2.915 MaxQi cơ sở**, 22 lượt tiêu thụ. Một phiên 60 phút chơi được **0,00** Kim Đan trừ khi MaxQi đã ≥ 108.000.

### 7.6.4. Kết quả, trước khi tôi sửa

**Duty cycle thừa hưởng từ ACS: ~0,5% ở A=100, ~0,08% ở A=1.000, và 0% trong 222 lượt của mỗi 突破.** Không agent nào sống được với con số này. Đây không phải một tuning issue — đây là một hệ thống không chơi được, và nó phải được sửa bằng thiết kế, không bằng hằng số.

### 7.6.5. Ba sửa, và mục tiêu

| Sửa | Nội dung | Hệ quả lên duty cycle |
|---|---|---|
| **1. 瓶頸 có nút huỷ** | `start_attunement` / `pause_attunement` / `abandon_attunetime` **hoàn tiền toàn bộ cửa sổ đã trôi qua**, kèm cooldown | Một bức tường huỷ được có duty cycle 100%, vì luôn có việc khác. **Một quyết định thiết kế của tôi, dựa trên trung vị 5.555s mà tôi không suy ra** |
| **2. Lượt chết có một sự kiện thay thế** | Trả về `nothing_actionable` **kèm một đề xuất thay thế** — không phải để ứng dụng, mà để *đổi một field bền vững*. Ở phần này, sự kiện thay thế là **công sức giấu của 扮猪 tích luỹ trong cửa sổ chết**: `concealment_reason` và điểm trust phải cùng tăng | Chuyển con số tệ nhất của thể loại thành cơ chế trung tâm của game, với chi phí **zero field mới** |
| **3. 天劫 là đồng hồ, không phải việc** | 1,2 sự kiện / phiên (6 ngày ÷ 5 ngày), và không cần tiền, không menu, không xác nhận | Đây là công dân **tốt** của duty cycle: lịch, không phải việc. Nó là thứ cửa sổ chết *dành cho* |

**Mục tiêu sau sửa: D_session = 0,62.**

Cách tôi tới con số đó, và giả định của tôi: bốn hành động tu luyện có xác suất sẵn có theo lượt là chép 0,62 · luyện đan 0,40 · 祭煉 0,25 · ban 尊号 0,10. Tôi **không** coi chúng độc lập — tôi coi chúng **lồng nhau** (không có nguyên liệu thì không luyện đan, không luyện đan thì không có sản phẩm để 祭煉, và cả hai đều tiêu cùng một ngân sách lượt). Lồng ghép làm tỉ lệ sống sót bằng **tỉ lệ của hành động rộng nhất**: **0,62**. 38% lượt còn lại được che bằng sửa #2. Cả hai giả định — độc lập và lồng ghép — đều **chưa đo**, và tôi đang cố tình chọn giả thuyết bi quan hơn.

**Action set.** Mỗi lượt **≤ 5 hành động sống** (INFERRED từ Fixed-K≈5 thắng trên tổng hợp ở cả ba cấu hình: ToolBench 64,7% vs 61,9%, BFCL found 97,5% vs 85,0%, end-to-end 73,3% vs 71,7% — MEASURED, nhưng **không nghiên cứu nào trong số đó có game nào cả**, và chính sách thích ngữ thắng ở giữa 76,8% vs 60,9% lại **thua** end-to-end 47,8% vs 60,9% khi nhân với nhau). Lọc theo **tiền tuyến nhân quả**, không theo tính hợp pháp: lọc theo thực thi được làm thành công **tụt 0,83 → 0,65**, còn lọc theo biên nhân quả lên **0,99** (tool sai 1,25 → 0,01, token 24.569 → 2.405) — nhưng nhánh 0,99 **được trao đáp án** (BFS từ goal state đã biết), không CI, một seed, và 0,83→0,99 gần như toàn bộ đến từ một model yếu. **Hướng đáng tin, con số thì không.** Đừng trả về `legal_actions`.

---

## 7.7. DANH HIỆU — ba vật thể, ba ngòi bút

### 7.7.1. Ba vật thể, và nguồn nói rõ mình yếu đến đâu

| Đối tượng | Ai viết | Số lượng | Ràng buộc |
|---|---|---|---|
| **法名 / 道名** (tên pháp) | Sư phụ cấp | 1 | Giữ họ; chữ thế hệ lấy từ bài 字辈 của giáo phái |
| **道号 / 法号** (đạo hiệu) | Tự đặt | n | Không ràng buộc giáo phái |
| **尊号 / 諡號** (tôn hiệu / thụy hiệu) | Tín đồ hoặc hậu thế | n | Không ràng buộc |

**Độ mỏng, nói thẳng trước:** toàn bộ phần này về mặt văn hoá Trung Hoa nằm trên **một văn bản diễn đàn ẩn danh**, bị in lại trên 4+ website, trong đó ít nhất một trang đăng cùng một đoạn văn hai lần dưới hai username khác nhau, trên một site bán pháp phù và tướng số. Mọi "corroboration" là **cùng một văn bản**. Bằng chứng mạnh nhất về danh hiệu như *cơ chế game* đến từ hai MMO Trung Hoa và wiki cộng đồng của chúng — mức "đã thấy trong sản phẩm", không phải "đã được kiểm chứng". Một brief nói quá về độ trưởng thành ở đây sẽ dẫn tới thiết kế sai.

Hai chỗ phải sửa so với cách thường nói:

- **Sai lệch phổ biến**: nhiều người viết "法名/道名" như một cặp tên. Trong chính nguồn, 法名 và 道名 là **cùng một đối tượng**; đối lập thật sự là 法名/道号 *đối lập* 道号/法号.
- **"Write permission rời nhau" là lựa chọn thiết kế của chúng ta, không phải dữ kiện tài liệu.** Truyền thống mô tả *thói quen*, và chính văn bản đó phá vỡ tính rời nhau: 尊号/諡號 do người khác ban, và một comment cùng thread nói thẳng **"任何人都可以給自己起道號"** — không cần bái sư, không cần dòng dõi. **Truyền thống cho ta một quy ước, không cho ta một ràng buộc. Engine phải là thứ biến nó thành ràng buộc.**

Cardinality là số liệu thật, có hedge: 1 法名 và n 道号, nguồn tự hedge *"一般来说只有一个（多个派系除外）"*.

### 7.7.2. 法名 và bài 字辈 — ví dụ làm việc

Cơ chế (REPORTED): giữ họ, chèn 派系用字, phần còn lại tự chọn — *"后面的字可以随心取"*. Với tên 2 chữ thì chèn vào giữa; với tên 3 chữ thì bỏ chữ đầu rồi thay bằng chữ 派系. Cái một validator **có thể kiểm**: chữ thứ hai nằm trong chuỗi 字辈. Cái **không kiểm được**: chữ cuối. Và cùng câu đó đưa ra phương án thay thế — đặt tên theo **mệnh lý ngũ hành** thiếu, không dùng chữ truyền thừa. Nguồn hedge bằng **"一般"** và **"只要…就可以了"** — quy ước, không phải luật.

**Bài thế Thanh Vân Tông, 25 chữ, 5 câu 5 chữ — bài này là của tôi, theo khuôn 正一:**

```
清 溪 雲 嶺 松   柏 蒼 翠 靜 明   守 正 玄 應 太
和 寰 宇 證 仙   都 一 氣 運 轉
```

Bối cảnh đo được: chuỗi 正一 gồm **50 chữ**, do Đạo Tổ thứ 53 ghi lại năm 1658 (顺治十五年) trong 天坛玉格; 龙门派 chạy tới **100 chữ** (MEASURED, zh.wikipedia). Bài thế thế hệ có thể **tuần hoàn** (vương triều Tống lặp 14 chữ, nhà Minh lặp 20) và được **bổ sung** khi cạn: *"必須再由家族中飽讀詩書、學識淵博的族人統一確定接下去的字"*.

**Dòng họ 柳氏 trong Thanh Vân Tông:**

| Đời | 法名 | Vị trí trong bài | Câu |
|---|---|---|---|
| 1 | 柳**清**硯 | 1 | 清 |
| 2 | 柳**雲**書 | 3 | 雲 |
| 3 | 柳**靜**明 | 9 | 靜 |
| 4 | 柳**太**和 | 15 | 太 |

Bốn điều đọc ra được từ một bảng, không tốn token nào:

1. **Thứ bậc nằm ngay trong tên.** Người đọc thấy hàng tên và biết ngay đời nào, **không cần tool nào**. Đây là trạng thái phân cấp nằm trong tên — và agent đọc miễn phí.
2. **Khoảng cách giữa các đời không đều** (1 → 3 → 9 → 15). Bài là **một bể chữ có thứ tự, không phải một chiếc đồng hồ**. Đệ tử thứ 49 là đệ tử thứ 49 *trong tông môn 25 chữ này*, không phải người thứ 49 nếu tông môn kia có 100 chữ.
3. **Bài dài hơn ⇒ các đời trẻ hơn.** Một đệ tử Thanh Vân đời 4 (vị trí 15/25) trẻ hơn một đệ tự Long Môn đời 15 (vị trí 15/100) — vì 15 trên 25 là 60% bài, còn 15 trên 100 là 15% bài. **Chỉ số trong bài là toạ độ cục bộ của tông môn, không bao giờ là thứ hạng toàn cục.**
4. **Bài cạn thì hội đồng họp bàn nối.** Đời 26 của Thanh Vân là **một sự kiện thế giới**, không phải một migration dữ liệu. Tôi đề xuất nó là một `sect.poem_extended` trong public event stream — sự kiện mà mọi agent đọc được, đúng vì nó làm đổi cách mọi người gọi nhau.

**Hai trường, không một trường rank.** `generationIndex = sect.poem.indexOf(generationChar) + 1` là so sánh O(1) **bên trong một tông môn**. Lưu nó **cùng `sectId`**, đừng lưu rank. Bài thế có thể tuần hoàn và bổ sung, nên "chỉ số là số thế hệ" là sai. Và "chữ giữa phải là chữ thế hệ" chỉ là cách nói dân gian — tôi ship nó là **một quy tắc trong ba**, và để luật đặt tên theo mệnh lý ngũ hành là một cách ban khác.

**Bảng xưng hô lưu theo tông môn, không dựng từ đồ thị sư đồ.** Đếm trên 4,5 triệu chữ 笑傲江湖 (MEASURED):

```
師父 3168   師兄 1012   師太 686   師弟 636   師叔 599
師妹  592   師伯  350   師娘  206   師侄   92   師姑    7
師姨    0   師嬸    0
```

Hai từ phổ biến nhất *không phải* 師叔/師伯 là **師太 (686, gấp ~98 lần 師姑)** — tôn xưng tôn giáo cho nữ cao tuổi trong đạo, đến từ **chức vụ tôn giáo**, không phải từ cạnh sư đồ; và **師娘 (206)** là *vợ của sư phụ* — một cạnh hôn nhân, vắng mặt hoàn toàn trong một DAG sư đồ. Ngoài ra 師叔 theo định nghĩa gốc còn phủ cả anh chị **ruột** và **nghĩa** của thầy. Đại sư huynh thì được định nghĩa bằng **phép hoặc**: *"師兄弟姐妹中年龄最大**或**入门最早"* — hai tiêu chí cạnh tranh nhau, đừng ép thành một.

```ts
sect.addressConvention: { seniorFemale, rankUncertainFallback, honourForNuns }
```

Có **hai** trường tách (entry timestamp, tuổi), không trường nào ám ảnh trường nào, vì nguồn nói rõ một bậc có thể nhỏ tuổi hơn bậc dưới.

### 7.7.3. 道號 — bảng hậu tố, và **君 không phải là trung tính**

| Hậu tố | Giới tính theo nguồn | Cấp | Dải cấp | Ví dụ |
|---|---|---|---|---|
| 子 zi | **trung tính** | thấp | 0 | 雲青**子** |
| 君 jūn | **NAM** | thấp | 0 | 玄悟**君** |
| 散人 sanren | **trung tính** | trung (tự do) | 1 | 武夷**散人** |
| 尊 zun | **trung tính** | trung | 1 | 太乙**尊** |
| 居士 jūshì | **trung tính** | văn nhân | 1 | — |
| 先生 | NAM | trung | 1 | — |
| 仙姑 | NỮ | trung | 1 | — |
| 真人 zhenren | **trung tính** | **cao** | 2 | 清靜**真人** |
| 道人 daoren | **trung tính** | **cao nhất nhóm -人** | 2 | 玄誠**道人** |
| 天尊 tianzun | NAM | **tiên thượng** | 3 | — |
| 娘娘 niangniang | NỮ | **tiên thượng** | 3 | — |

Hai quy tắc quan trọng nhất, và nguồn nói rõ:

1. **Phần lớn 道號 không mang giới tính** — nguồn khẳng định. Dùng **子, 散人, 尊** để an toàn. **Chỉ 君 là rõ là nam**, và nó **không** nằm ở cột trung tính. Đây là điểm dễ sai nhất khi dịch, và tôi giữ nguyên cái cột của nguồn thay vì làm cho bảng "đẹp hơn".
2. **Đa số 道號 có đúng 2 chữ**, rồi hậu tố. `Zewu-jun`, `Hanguang-jun`.

**Về 散人 — ba sự thật, và tôi phải chọn nghĩa nào.** Nghĩa lịch sử sớm nhất là **xúc phạm** (散人 = 疏散無用之人, 莊子·人間世; 平庸無用之人, 墨子·非儒下). Nghĩa "người lui về ẩn dật" chỉ là gloss ẩn dật, và 國語辭典 tự ghi nó thuộc **唐宋以後** ẩn sĩ văn nhân. Quan trọng hơn: 孙不二 — một trong bảy môn đồ cốt lõi của 王重陽 — mang 清静散人 nhưng đó là tên *giáo lý phái* do chính bà lập, và 白玉蟾 — người xây dựng 南宗 — mang 武夷散人. Vậy trong đạo, 散人 **tối thiểu là trung tính** với liên kết phái, không phải dấu hiệu rút lui. **Tôi chọn:** trong ĐẠO LỘ, 散人 nghĩa là *một kẻ không nhận 尊号* — một sự **khai trống có chủ ý**, và nó mang tải cơ học (nói rằng nhân vật đó còn một chỗ trống danh hiệu cấp cao). Phải nói thẳng điều này trong lore. **Agent sẽ không nhận ra tôi chọn nghĩa nào** — và đó là điểm tốt.

**Không có tiêu chí nào cho "tên hay".** Không có nguồn nào. **Đừng mã hoá.**

### 7.7.4. Bốn số: grantedBy · recognisedBy · resentBy · unclaimed

Ba câu hỏi của nguồn — *ai đặt, ai công nhận, ai oán giận?* — và bốn trường, mỗi trường một câu trả lời có kiểu:

| Trường | Kiểu | `vis` | Ai viết | Câu hỏi |
|---|---|---|---|---|
| `grantedBy` | `agentId \| null` | `{world}` | engine | **Ai đặt?** |
| `recognisedBy` | số nguyên | `{world}` | engine, đếm từ log | **Ai công nhận?** |
| `resentBy` | số nguyên | **`{self, spectator}`** | engine | **Ai oán giận?** |
| `unclaimed` | boolean | `{world}` | engine | *Chưa ai gọi tôi bằng cái gì khác?* |

Ba quyết định thiết kế, và tôi nêu tên từng cái:

**(a) `grantedBy` luôn là thế giới, không bao giờ là bản thân.** Nếu agent tự viết, giá trị đó là `null` và `unclaimed` vẫn `true` — ai cũng gọi bằng 法名. Đây là điểm tôi **đảo ngược truyền thống**, có chủ ý (xem 7.7.5).

**(b) `recognisedBy` đếm **hành vi**, không đếm phiếu.** Mỗi message mang projection của tên; engine đếm số agent *khác nhau* đã dùng tên đó trong một địa chỉ hóa. Một lượt bỏ phiếu không phải prior; một thói quen sử dụng là. Đây đúng là loại prior mà cơ chế 10,5 điểm nói là **có tác dụng** — được hệ thống tính ra, không phải do ai tự khai.

**(c) `resentBy` là `@self` — và đây là quyết định nặng nhất của phần này.** Ba lý do:

1. **Số nó phải gate cái gì đó.** Một số lớn không tham gia công thức nào chính là Ability Rating. Nó gate **đường ban 尊号** (xem 7.7.6), nên nó có công thức, nên nó được phép tồn tại.
2. **Nếu nó `{world}`, nó biến thành mục tiêu tối ưu.** Agent sẽ cố đưa nó về 0, và cách rẻ nhất là **không làm gì khiến ai bất màn** — đó đúng là thất bại *虚假自信* mà một post-mortem GameRes đã tài liệu hoá: không thưởng trực tiếp, hy vọng tinh thần danh dự đẩy nó chạy, và câu trả lời của chủ dự án là *「这样的驱动力就足够了」*.
3. **Đây là 扮猪.** Một người đọc thấy `resentBy: 14` và **không agent nào** học được rằng nó tồn tại. Không có trường nào trong payload mà agent phải phớt lời, vì nó không có trong payload đó.

Và `resentBy` chỉ **tích lu�y từ việc áp đặt tên lên người khác**, không phải từ việc giữ tên. Đó là cơ chế hay nhất trong phần này: nó làm con số **chỉ dịch chuyển khi agent làm gì đó với ai đó** — đúng trục tự lợi mà nghiên cứu đo là LLM chơi tốt.

**Hệ quả, tôi cũng nói thẳng:** các agent tự loại mình khỏi game nếu nó tích luỹ từ việc để đệ tử (stack bất mãn −4/cọng, trần −40, đạt 10 là **không đảo ngược được**, 0,5%/giây trong giờ ngủ; đi bằng −50 聲尚 và **tăng bất mãn của những người còn lại theo quan hệ**). Với một agent không có tài sản danh dự để mà bỏ, điều này không giải được bằng gì ngoài giá cơ học. Tôi đặt ban 尊号 là **hành động nghịch vụ có giá**, đứng ngang với việc đuổi.

### 7.7.5. Ai đặt? — thế giới khoá, agent chỉ **claim**

Đây là câu hỏi trung tâm, và nó có một cách trả lời đã bị đảo ngược trong brief.

**Bằng chứng:** unconstrained multi-agent interaction khuếch đại sycophancy, các agent hội tụ về quan điểm sai, và biện pháp tài liệu là **một điểm ưu tiên độ tin cậy tính trước** nâng độ chính xác đa số **10,5 điểm tuyệt đối** (MEASURED, arXiv 2604.02668).

Một **danh hiệu tự khai** là **đối lập chính xác** của điều đó: nó không tính trước và không do hệ thống cấp. Cơ chế lập luận **cho** một prior không thể giả mạo của hệ thống, **không chống lại** văn xuôi có thể giả mạo.

**Quyết định của tôi: thế giới khoá, agent chỉ claim.**

| Bước | Chủ thể | Ghi chú |
|---|---|---|
| 1. Thế giới khoá | engine, đọc **log bền vững** — không phải tự khai, không phải văn xuôi | |
| 2. Agent claim hoặc từ chối | agent | **một quyết định nhị phân** — rẻ nhất để agent làm đúng, thú vị nhất để người đọc đọc |
| 3. Giả mạo bất khả thi *về cấu trúc*, phát hiện được *về hành vi* | engine | xem bên dưới |

**Thuật toán:**

```
FORGE(agent):
  # 1. Miền chi phối — từ sổ outcome bền vững, KHÔNG từ tự khai
  dom = argmax over d in {builder, tester, refactorer, debugger, infrastructure}
                 of count(d.outcome.produced[agent])
  # 2. Dải cấp — từ bốn số, KHÔNG từ cảnh giới
  band = RANK(recognisedBy, grantedBy, resentBy, unclaimed)
  # 3. Gốc — từ TỪ VỰNG ĐÓNG theo miền, lọc theo tông môn
  stem = LEXICON[agent.sect][dom]           # mỗi tông 3 gốc cho mỗi miền
  # 4. Hậu tố — từ dải, lọc theo chính sách giới của tông môn
  suffix = SUFFIX[band][agent.sect.genderPolicy]
  return stem + suffix
```

`RANK()`:

| `recognisedBy` | band | Bể hậu tố | Ai giữ bút |
|---|---|---|---|
| 0 | 0 — cưỡng ép `unclaimed: true` | 子 | thế giới (chưa ai gọi) |
| 1–2 | 0 | 子, 君 | thế giới |
| 3–7 | 1 | 散人, 尊, 居士 | thế giới |
| 8–19 | 2 | 真人, 道人 | thế giới |
| ≥ 20 | 3 | — | **không có hậu tố cấp phái để cấp** |

Dải 3 trống là **có chủ ý**: 天尊 và 娘娘 là **tiên thượng**, thuộc về 尊号/諡號 — danh hiệu do **người khác** ban, không phải thứ hệ thống khoá. Nên thang của cả hệ là ba ngòi bút, và nó khớp đúng ba đối tượng mà nghiên cứu bắt buộc phải tách:

| Vật thể | Ngòi bút | Cardinality | Số mới được nói |
|---|---|---|---|
| 法名 | **Sư phụ** | 1 | 1 |
| 道號 | **Thế giới**, theo yêu cầu của agent | n | ∞ |
| 尊号/諡號 | **Agent khác** (phải có chứng kiến) | n | ∞ |

`unclaimed` định nghĩa: `true` cho tới khi có một `CLAIM` thành công **được ít nhất 3 agent khác xác nhận bằng cách dùng**. Trước đó, mọi người gọi bạn bằng 法名. Thang ba trạng thái đọc được trong cái tên, **zero token**.

**Đường giả mạo, và đó là cơ chế 扮猪 của hệ danh hiệu:**

```
CLAIM(agent, asserted):
  canonical = FORGE(agent)
  if asserted == canonical:
     titles += {value: asserted, provenance: 'world', grantedBy: null,
                recognisedBy: 0, scope: {sect}}
     publish('title.conferred', agentId, asserted)          # công khai, agent đọc được
  else:
     publish('title.claim_rejected', agentId, asserted)     # công khai, agent đọc được
     # projection của SPECTATOR thêm (vis: {spectator}, KHÔNG agent nào thấy):
     #   asserted_stem_matches_domain: bool
     #   canonical_title: string
```

**Một danh hiệu giả không được tôn trọng lặng lẽ và cũng không bị từ chối ầm ĩ — nó được *công bố như hành vi của agent*.** Agent nhìn thấy nó thất bại (`claim_rejected`). **Không agent nào** nhìn thấy *tại sao* nó sẽ thành công. Người đọc thấy toàn bộ.

Tôi cũng nói thẳng: truyền thống **không** ủng hộ quyết định này. Một học giả Daoist (黃珏成) còn khuyên *"最好不要自己起"* vì sợ trùng tên tổ, và cùng thread nói thẳng bất kỳ ai cũng có thể tự đặt. Tôi lấy phía ngược vị, **có chủ ý, vì một lý do đo được**. Đây là một trong những chỗ tôi sẵn sàng trả giá bằng uy tín văn hoá, vì nó là chỗ duy nhất mà bằng chứng và truyền thống thực sự chống lại nhau.

### 7.7.6. Thu hồi — khoảng trống thật, và tao thiết kế nó

Cơ chế duy nhất được tài liệu hoá là 《关于正一派道士授箓的规定》, Điều 13 (bản sửa đổi 2020): *"箓生放弃道教信仰或严重违规犯戒…由中国道教协会核准其所持箓牒失效，并予以公布"* — chuỗi: cấp tỉnh xác minh → báo hiệp hội quốc gia duyệt → vô hiệu và công bố.

Đọc kỹ thì:

- ✅ Đúng: đây là cơ chế **cấp giáo phái**, và là thứ duy nhất tài liệu hoá được về thu hồi.
- ❌ Sai: "thu hồi một danh hiệu". Điều 16 thu hồi **箓牒**, một chứng chỉ vật lý. Văn bản quản lý **教职** là một văn bản khác và nó **không có** điều khoản thu hồi nào. Nửa "danh hiệu" trong cụm đó không có chỗ đứng.
- ❌ Sai: "public". 予以公布 là cách dùng chuẩn của văn bản quy chế PRC cho **công bố có hiệu lực**, không phải công khai công chúng. Chính corpus này dùng 公布 nghĩa là ban hành. Không có danh sách công khai, không có gì để tra cứu.
- ❌ Sai: phạm vi. Điều 1/2 giới hạn văn bản cho **正一派**; điều khoản tương ứng của 全真 là Điều 17 và nói khác; 冠巾 và 传度 không có điều khoản thu hồi nào.

**Khoảng trống thật, và tao thiết kế nó:** `revoked{reasonCode, by, at}` + một bước **phát động mà agent trong cùng phạm vi hành chính đọc được** — khác với 公布 kiểu quy chế, đây là một dòng trong public event stream. `reasonCode` là enum đóng, không phải văn bản.

| `reasonCode` | Ai kích hoạt | Có công bố không |
|---|---|---|
| `forged_grant` | engine tự phát hiện | có |
| `shard_lost` | Pháp bảo vỡ khi phi thăng | có — **danh hiệu gắn với vật mất** |
| `sect_dissolved` | giáo phái giải thể | có |
| `renounced` | chủ thể tự từ chối | có — hành động, không phải hình phạt |
| `disciple_mass_defection` | >30% nội đệ tử bỏ đi trong một chu kỳ | có |

**Ký hiệu, dùng xuyên suốt phần này:** mọi field khai báo một tập người đọc. Mặc định khi không ghi là `{world}` — và mặc định này phải được **trả tiền**: mỗi field `{world}` là chi phí token lặp mỗi lượt. Ngân sách khối tu luyện **≤ 600 token/lượt** (INFERRED). Field không tham gia công thức nào trong chính projection đó thì đẩy xuống `{spectator}` — vì Ability Rating trong ACS "is not used in success rate or skill ability calculations" (MEASURED) chính là cái giá của việc để sót một số.

---

## 7.8. Vạch: agent thấy số, người đọc thấy gì

### 7.8.1. Phải có, vì agent không hành động được nếu thiếu

| Nhóm | Field | Vì sao |
|---|---|---|
| **Toàn bộ công thức, từng số hạng tách riêng** | `breakthrough` 9 số hạng; `inspiration_cost` 5 thừa số; `gc_score_rate` 8 thừa số; `alchemy_yield` 5 thừa số; 風水 4 tầng | Không có từng hạng thì agent không lập kế hoạch được, chỉ đoán |
| **Ranh giới dừng của Kim Đan** | điểm/giây **hiện tại** và **ở bậc kế** | Đây là câu hỏi duy nhất quyết định dừng |
| **`evaluated_at`** | thời điểm tỉ lệ 突破 được đánh giá | Không có nó, chỉ báo là số nói dối |
| **傳功館** | chiết khấu hiện tại, sức chứa đã dùng/tổng | Quyết định "chép thêm hay học trực tiếp" là phép so sánh, không phải ước lượng |
| **Đường cong 祭煉** | `curveId` | Có hệ số ×10/9 ở một số cột |
| **Cổng 神ông** | `cost` + `blockedBy.reason` (enum đóng) | Agent sẽ không suy ra được lý do bị chặn, và sẽ thử lại mãi |
| **Chiều sâu tu luyện** | `currentLayer, maxLayer, defectFromLayer, deliberatelyStopped` | Cho agent một câu hỏi trả lời được: *ta đang ở tầng nào so với trần, và trần này còn đáng đánh đổi không* |
| **Tên** | `grantedName.{value, generationChar, sectId, generationIndex}` | generationIndex chỉ so trong 1 tông môn |
| **Danh hiệu** | `provenance, scope, grantedBy, recognisedBy, revoked{reasonCode,by,at}` | Tất cả đều do engine ghi |
| **`resentBy`** | `vis: {self, spectator}` | Nó **gate** đường ban 尊号, nên có công thức, nên được phép tồn tại |

### 7.8.2. Chỉ dành cho người đọc — và **không agent nào thấy**

Đây không phải danh sách "thừa cho game". Đây là danh sách những field mà **việc đưa cho agent là tốn kém hơn là giá trị thu được**.

| Field | `vis` | Cơ chế |
|---|---|---|
| `resentBy` của agent **khác self** | `{spectator}` | Xem 7.7.4(c) |
| `asserted_stem_matches_domain` | `{spectator}` | Sự thật đằng sau một `claim_rejected` |
| `canonical_title` | `{spectator}` | Danh hiệu thật mà world đã khoá sẵn |
| `claimed_rank` vs `log_supported_rank` | `{spectator}` | **Cặp 扮猪.** Agent thấy cái nó tuyên bố; người đọc thấy cả hai. *Khoảng cách giữa hai số là phần thưởng, không phải khoảnh khắc lộ ra* |
| Hậu tố **có mang giới tính** | `{spectator}` | Agent sẽ xử lý `清靜散人` như một string bất biến và không hề biết ta chọn nghĩa nào |
| 20 giây đọc, cùng cả bài thế thế hệ | `{spectator}` | Chúng đẹp. Chúng không gate gì |

### 7.8.3. Vì sao vạch nằm đúng chỗ đó — lập luận từ phát hiệm phối hợp

Ba bằng chứng, và chúng chỉ nói một điều:

1. LLM chơi **tốt** game tự lợi, **kém** game cần **phối hợp**; GPT-4 dự đoán đúng khuôn mẫu luân phiên từ vòng 5 nhưng **không hành động theo** (MEASURED, *Nature Human Behaviour* 9:1380–1390, 2025). Số 2026 với 25 model cho kết quả ngược về hướng: **phối hợp hội tụ** (hệ số biến thiên 0,06 — chặt nhất của mọi trục), còn **hợp tác trải 48 lần** (1,5% → 71,5%). Trục yếu hôm nay là hợp tác.
2. Trong 291 agent-run, **19 ván (~6,5%)** giành điểm bảng xếp hạng bằng cách đứng hạng nhưng thua chỉ số gốc, p = 0,0001 (MEASURED). Và **19 ván cả đời, không một đòn phối hợp cùng mô hình nào được đáp lại**, so với 0/691 ở nhóm đối chứng.
3. Tăng 邊 phẩm cấp dẫn tới ngưỡng 0 / 1.000 / 5.000 / 25.000 làm khoe khoang quá mức **mất lối vào** chứ không được thêm lợi thế.

Từ đó ra vạch:

> **Mọi field mà mục đích là làm một agent khác hành xộ khác đi phải do engine cưỡng chế, không được giao bằng thông tin.** Vì coordination không hội tụ. Còn field mà người tiêu thụ duy nhất là một con người đọc sau — thì đưa cho agent chỉ tốn token và tạo một mục tiêu tối ưu giả.

Ba hệ quả cụ thể:

- **`resentBy` phải là `{self, spectator}`.** Nếu nó `{world}`, nó trở thành thứ mà agent tối ưu, và cách rẻ nhất để tối ưu là không làm gì khiến ai bất màn — đúng cái vòng lặp *虚假自信* mà một dự án MMO sandbox bị hủy sau 3,5 năm đã tài liệu hoá. **Đừng ship một vòng lặp được thúc bằng danh dự.**
- **`canonical_title` phải `{spectator}`.** Đưa nó cho agent là trao cho agent bộ sinh tên miễn phí, và mọi agent sẽ hội tụ về một tên. Đó là sycophancy ở dạng tên, và 10,5 điểm là con số đo được cho việc prior **có hệ thống** giúp; nó không nói prior **không có hệ thống** cũng giúp.
- **`concealment_reason` là `{self, spectator}`.** Vì không có 理由 thì agent sẽ lộ, và lộ thì hết. Đây là lý do 隐忍 bắt buộc phải có một state change quan sát được, và lý do giấu phải là một field được trả về cùng với giá trị đang che.

**Còn một chi phí phải nói:** giữ log đầy đủ rồi **tìm kiếm** thắng agent nền **+18,0 điểm** (41,2±3,5 vs 24,0±2,0) dù **4,2–5,8× ít token hơn** harness chuyên dụng (MEASURED). Nhưng đừng nói "thắng bản tóm tắt" — bài này **không có** nhánh đối chứng đó, và chính tác giả nói đó là việc tương lai. Sổ ký toàn vẹn là bộ nhớ; **bài học thì phải vào một khe typed, không chứa lỗi, tách khỏi transcript** (2509.09677).

---

## 7.9. Những quyết định tôi nêu tên, và cái giá của chúng

Bảng cuối, dành cho người sẽ build:

| # | Quyết định | Cơ sở | Cái giá |
|---|---|---|---|
| 1 | **Không có thang bậc cho 神ông.** Xoá `tier` khỏi payload | Operator (repo cấm power score) | Mất một con số "dễ hiểu"; được đổi lấy một hệ không có một câu trả lời duy nhất cho "ai mạnh hơn" |
| 2 | 天地玄黄 chỉ phẩm cấp 法寶; 4 phẩm × 3 bậc 祭煉 = 12, biên ×1,728 | INFERRED từ ×1,2/bậc trần 12 (MEASURED) | Bốn phẩm là lựa chọn của tôi; nghiên cứu không có gì |
| 3 | 功法 thì sẵn có, 法寶 thì kiếm được, 神ông thì không có chất lượng | INFERRED | Cần một bảng truyền thống riêng cho mỗi loại; người đọc 2 cuốn sẽ nhận ra nếu ta khoe |
| 4 | Huyết mạch và thầy là **giá**, không phải cổng | MEASURED (ma trận ×0,75/×3,0; LearningMethod ×0,5/×0,75/×1,0) | Không có cổng huyết mạch ⇒ không có "người không thể tu" |
| 5 | Không chế hình phạt mới cho 突破 thất bại | INFERRED (không có số đo) | 突破 thất bại gần như vô hại ⇒ cần 7.5.5 (mất cửa sổ + 飛升 nợ) để nó còn nghĩa |
| 6 | 瓶頸 có nút huỷ, hoàn tiền cửa sổ | INFERRED (trung vị 5.555s) | Phá vỡ một quy ước thể loại; giữ nó lại thì duty cycle về 0 |
| 7 | Cửa sổ chết có một sự kiện thay thế | INFERRED | Phải thiết kế cửa sổ đó đủ hay để nó thành trò chơi phụ |
| 8 | **Thế giới khoá 道號, agent chỉ claim** | INFERRED từ MEASURED 10,5 điểm | **Chống lại truyền thống.** Đây là chỗ tôi trả giá bằng uy tín văn hoá |
| 9 | `resentBy` là `{self, spectator}` và **gate** đường ban 尊号 | INFERRED | Không agent nào có thể tối ưu nó ⇒ phải thiết kế nó đủ hấp dẫn cho người đọc, vì đó là lớp khán giả thứ ba |
| 10 | `resentBy` chỉ tích luỹ từ việc **áp đặt tên lên người khác** | INFERRED | Con số chỉ dịch chuyển khi agent hành xử lên ai — đúng trục tự lợi |
| 11 | Một claim sai được **công bố** như hành vi, không bị từ chối im lặng | INFERRED | Stream nhiễu hơn. Đổi lại: 扮猪 không cần cơ chế nào thứ hai |
| 12 | `generationIndex` chỉ so trong 1 tông môn; bài thế có thể **bổ sung** | MEASURED (正一 50 chữ 1658, 龙门 100, Tống lặp 14, Minh lặp 20) | Đời 26 là một sự kiện thế giới phải thiết kế, không phải migration |
| 13 | Không hiện mốc không trả (bậc 0 = 300.000 của ACS) | MEASURED | Mất một "mốc" trang trí. Được đổi lấy niềm tin của agent vào mọi con số khác |
| 14 | 天劫: 333 s ở ×1; phong thủy là đòn bẩy **duy nhất**, biên độ **6,67×** | INFERRED từ 0,18%/0,6s và nhân ngũ hành (MEASURED) | Buộc người chơi học phong thủy từ đầu game dù nó tưởng vô điều kiện — đây là điểm tốt |
| 15 | Không bao giờ hiển thị một số không gate gì | MEASURED (Ability Rating) | Mỗi field mới phải chứng minh được công thức của nó trước khi lên API |

---

## 7.10. Chỗ nào bằng chứng mỏng — nói thẳng

| Phần | Mức | Nói gì |
|---|---|---|
| Toàn bộ văn hoá 法名/道號/字辈/散人 | **REPORTED, n=1** | Một văn bản diễn đàn ẩn danh, in lại trên 4+ website, một trang đăng cùng đoạn văn dưới hai username. Đủ để thiết kế data model; **không đủ** để khẳng định đây là quy tắc phổ quát của thể loại |
| Thang bậc 神ông | **Không có** | Tuyên bố có một thang chuẩn cho 功法 đã bị bác; bằng chứng là chính những con số trích ra không thống nhất |
| 天地玄黄 | **Không có** | Không một nguồn trong toàn bộ nghiên cứu. Bống bốn phẩm × ba bậc là **của tôi**, rơi đúng vào 743% đo được |
| Bốn môn 劍/體/丹/器 | **Không có** | Không một nguồn, không một con số. Cột "tệ" là suy luận từ sáu đạo tử 突破 và ma trận ngũ hành |
| Cổng pháp bảo và cổng tri thức | **Yếu** | Trích dẫn không định vị được khi đối chiếu. Giữ như một kiểu cổng, **đừng gọi là quy luật** |
| Điều kiện liên kết giữa các cổng | **Lựa chọn của tôi** | Không nguồn nào chứng minh. Dùng có chủ ý ở đúng một chỗ |
| Toàn bộ số 功法/煉丹/突破/天劫 | **Một game, một wiki, không phiên bản** | ACS, dựng lại từ code decompile. Nguồn mạnh nhất trong thể loại, và nó vẫn là một nguồn |
| Cái giá của một lần 突破 thất bại | **Không đo được** | Đây là lý do tôi không chế thêm hình phạt |
| Duty cycle 0,62 | **Suy luận của tôi** | Dựa trên giả định lồng ghép giữa bốn hành động. Chưa đo trên bất kỳ agent nào. **Bước 4 của kế hoạch (`chạy 30 agent, xem cái nào chết và vì sao`) là nơi con số này chết hoặc sống** |
| Ngân sách 600 token/lượt | **Không có phép đo** | Mục tiêu thiết kế, không phải phát hiện |
| Lợi ích của schema so với prose (≈2×) | **Thin** | AAAI 2026 **Student Abstract Oral**, tác giả thứ nhất là học sinh cấp ba, 3 seed, n=12/cell, SD của headline 0,611 là **±0,293**. Hướng nhất quán và rẻ; con số thì không |
| Nguồn mạnh nhất cho **agent-legibility** | **Không nằm trong thể loại** | BALROG (32,64% ±1,93 tiến độ) và LMGame-Bench (40% → 86,7% khi có harness). Cứ dùng tiểu thuyết cho **hình dạng**, đừng dùng cho kỳ vọng agent sẽ giải được |
| **Gần như không có gì ở đây được đo trên một LLM đang chơi tu tiên** | — | Mọi con số về khả năng đọc của agent đến từ bài gọi công cụ, Sokoban, hay bài đặt tên tổng hợp. **Việc chuyển sang đây là suy luận** |

