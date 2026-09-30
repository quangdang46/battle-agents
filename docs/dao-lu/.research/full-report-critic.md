# Review: ĐẠO LỘ design report

Bảy section, tám agent, một research base. Đây là những chỗ tôi tìm được.

---

## 1. CONTRADICTION — xương sống trước, mọi mâu thuẫn khác đều dẫn về đây

### 1.1 Một lượt dài bao nhiêu? Năm con số, không cái nào giống cái nào

Đây là mâu thuẫn nghiêm trọng nhất, vì **mọi tuyên bố phạm vi phiên trong report đều thừa hưởng từ nó** — duty cycle, ngân sách token, số action, độ dài arc 40 ngày, số turn để đi tới Táng Kiếm Uyên.

| Section | Định nghĩa | Số lượt/phiên |
|---|---|---|
| **Agent chơi** §2 | *"Slot một lượt tôi đặt là **12 s** [SUY] → **300 lượt** → **417.600 token**"* | 300 |
| **Tu luyện** §7.6 | *"Một lượt = 1 giờ trong game = **25s** (suy ra từ 600 ÷ 24). Một phiên = **144 lượt**"* | 144 |
| **Vòng lặp** §2.1 | *"Số lượt / phiên `n` \| **30** \| 3.600 s ÷ 30 = 120 s/lượt"* | 30 |
| **Bản đồ** §5.1 | *"**1 lượt (turn)** \| **600 s** \| `[ĐO]` ACS"* | 6 |
| **Cốt truyện** §1.2 | *"Ngân sách cốt truyện mỗi lượt = **600 s = 10 phút thật**"* | 6, nhưng §2.2 vẽ **4** lượt |

Tệ hơn: **Cốt truyện mâu thuẫn với chính nó.** 600 s/lượt × 4 lượt = 2.400 s. Phiên là 3.600 s. 1.200 s = 20 phút không thuộc turn nào.

Và các con số phái sinh thì **tương phản nhau**, không chỉ khác nhau:

| Đại lượng | Agent chơi | Tu luyện | Vòng lặp | Bản đồ |
|---|---|---|---|---|
| Ván 金丹 | — | **33,3 phiên** | **33,3 phiên** | — |
| Gate 突破 | — | **222 lượt** (5.555÷25) | **46,3 lượt** (5.555÷120) | — |
| Một tầng 功法 | — | 4.001 s @ A=1000 | — | — |
| Cổng cản hành trình | — | — | — | **2 lượt / phiên 6** |
| Duty cycle của arc | — | ~0,5% | **76,7% D_machine** | 17% |

Cùng một phép tính (5.555 s ÷ độ dài lượt) ra **222** ở một chỗ và **46,3** ở chỗ khác. Không phải do tác giả khác nhau — cùng một người đọc cùng một con số, ở hai section, với hai đơn vị lượt khác nhau.

**Cái giá của mâu thuẫn này không phải là "số sai".** Nó là: nếu 1 lượt = 600 s thì cổng 突破 chiếm **1,54 phiên** và arc 40 ngày cần **6,7 phiên**; nếu 1 lượt = 120 s thì cùng cái đó là 12 lượt và arc là 6,7 phiên — **giống nhau**. Còn nếu 1 lượt = 12 s thì arc là 40 ngày / 6 ngày-per-phiên… Vòng lặp §2.1 nói: *"1 phiên = 3.600 s tường minh = 3.600 s in-game = 6,0 ngày in-game. Vòng 40 ngày = **6,7 phiên**."* Agent chơi §2 với 300 lượt/phiên thì **một lượt = 12 s**, tức 1 giờ game = 12 s, tức **1 ngày = 288 s**, không phải 600 s. Tức đơn vị thời gian sụ đổi. Không section nào nói điều đó.

**Phải làm:** một bảng hằng số duy nhất ở đầu report — `TURN_WALL_SECONDS`, `TURN_GAME_SECONDS`, `DAY_GAME_SECONDS`, `SESSION_WALL_SECONDS`, `ACTIONS_PER_SESSION` — và mọi section khác **tham chiếu**, không viết lại. Đây là loại chỉnh sửa mà một biên tập viên làm trong một giờ và một tác giả tự làm thì không bao giờ.

---

### 1.2 Visibility primitive: bốn kiểu khác nhau, và hai bên đối nghịch về default

Operator chốt: **field visibility per-viewer là nguyên thủy của API, không phải field presence**. Bốn section định nghĩa nó bốn lần, không cái nào giống cái nào.

| Section | Kiểu | Default |
|---|---|---|
| **Ba khán giả** §1 | `Scope = 'operator' \| 'self' \| 'sect' \| 'arena' \| 'spectators' \| 'nobody'` trên `Scoped<T>` = `{[K]: {scope, value}}` | **không có default** |
| **Agent chơi** §1.2 | `Audience = 'owner' \| 'peer' \| 'public' \| 'spectator' \| 'engine'`, `Field<T>` = object runtime có symbol `FIELD` | không nói |
| **Tu luyện** §7.0 | `vis: {self} \| {own-sect} \| {world} \| {spectator}` | **`{world}` — "mặc định khi không ghi"** |
| **Sản xuất** §2.1 | `Visibility = {to:'agent',of:'self'\|'sect'\|'any'} \| {to:'spectator'} \| {to:'engine'}`, `Field<T> = {value, seenBy}` | không nói |

**Hai bên trực tiếp đối nghịch về default**, và đây là điểm quan trọng nhất:

> Ba khán giả §1: *"**no default**, because the default this API would otherwise have is `arena` — a field nobody annotated becomes visible to every agent. **Default-deny is the only direction in which a forgotten annotation fails safe.**"*

> Tu luyện §7.0: *"Mặc định `{world}` phải được **trả tiền**: mỗi field `{world}` là chi phí token lặp mỗi lượt."*

Default-deny vs default-allow. Report không nói ở đâu là nơi quyết định, và cả hai section đều viết như thể mình là chuẩn. Đây chính xác là loại quyết định mà một protocol không thể có hai lời.

**Và có một lỗi kiểu cấp, không phải lỗi diễn đạt.** Renderer duy nhất được viết ra (`Agent chơi` §1.2) làm:

```ts
if (node !== null && typeof node === 'object' && (node as any)[FIELD]) { ...dọn field... }
```

Nó chỉ lọc object mang symbol `FIELD`. Nhưng `Scoped<T>` của `Ba khán giả` §1 là `{declared: {scope:'arena', value:…}}` — **không có symbol**. Chạy renderer của Agent chơi lên một record `Scoped` sẽ đệ quy đi vào từng cặp `{scope, value}` và phát ra **nguyên vẹn cho mọi viewer**. `Ba khán giả` §10 gọi đây là điều khoản bàn giao số 1 — *"**`project()` là một hàm.** Ba lời gọi, ba tham số đầu"* — nhưng hai hình dạng dữ liệu trong report không cùng loại, và hình nào cũng chạy được với projector của hình kia mà không phát hiện.

---

### 1.3 Payload turn: hai section đo hai turn khác nhau, cùng gắn nhãn "đo"

| | Ba khán giả §2 | Agent chơi §2 |
|---|---|---|
| Turn context đầy đủ | **1.635 byte** | **1.287 token** p95 |
| Chuyển đổi | ≈545 token @ 3 B/token (dải 409–654) | js-tiktoken `o200k_base` |
| Action block | 539 B (33%) | 271 token |
| Peer block | 283 B | — |

1.635 byte ≈ 545 token. 1.287 token @ o200k ≈ 4.500 byte. **Hai turn context lớn chênh nhau ~2,8×, và cả hai đều gắn nhãn "đo".**

Hệ quả cụ thể: chi phí phiên (**417.600 token**) được tính từ turn nhỏ; tỉ lệ context phải bảo trì để giữ lời nói dối (**15,3%**) được tính từ turn lớn. Hai con số cùng hệ thống, hai đơn vị turn, không ai đối chiếu.

Thêm một mâu thuẫn nội tại ở **Agent chơi** §2: *"Toàn bộ ngữ cảnh một lượt = **1.443 token** ở lượt p95… 4 lượt transcript thô đã đầy một cửa sổ 16K."* 4 × 1.443 = **5.772**, không phải 16K. Chênh 2,8× — cùng tỉ lệ, cùng section.

Và hướng của chênh lệch thì **ngược nhau**. `Ba khán giả` §2 đo spectator = **325 B** < self = **401 B**: người đọc nhỏ hơn agent. `Agent chơi` §2.3 đo spectator = **1.572 token** > agent = 1.287, chênh **+285**. Một section nói payload người đọc nhỏ hơn, section kia nói lớn hơn 22%. (Hai section đo hai thứ khác nhau — event vs turn — nhưng không section nào nói điều đó, và cả hai đều được trích như "chi phí của 扮猪".)

---

### 1.4 Duty cycle: bốn mục tiêu, không cái nào giống cái nào

| Section | Mục tiêu |
|---|---|
| **Kinh tế** §2.4 | *"**D_tầng-1 ≥ 1 − 20/3.600 = 0,9944**"* |
| **Sản xuất** §7 | *"Duty cycle (lượt có ≥1 hành động có ích) \| **≥ 0,80**"* |
| **Agent chơi** §3.3 | *"**D_conversion ≥ 0.80** trên mọi cửa sổ trượt 30 lượt"* |
| **Vòng lặp** §2.3 | *"**Mục tiêu 50%.**"* trong dải 40–60% |
| **Ba khán giả** §9 | *"beat 隐忍 chiếm **10/60 phút = 16,7%** → duty cycle **≤ 83,3%**"* |
| **Tu luyện** §7.6.5 | *"Một bức tường huỷ được có duty cycle **100%**"* |

0,9944 · 0,80 · 0,50 · ≤0,833 · 1,00. Và "Tu luyện" §7.6.5 nói một bức tường **huỷ được** có duty cycle 100% — trong khi "Vòng lặp" §2.3 nói 隐忍 **bắt buộc** phải là lượt không có gì đổi và *"Game có `D_machine = 100%` **không diễn được 隐忍**."*

Hai section đưa ra hai điều kiện loại trừ **trực tiếp đối nghịch** về cùng một cơ chế. Một trong hai phải bị bỏ, và cái nào bị bỏ quyết định có còn 隐忍 không.

---

### 1.5 Action union 16 — nhưng cơ chế chống gian lận không có trong đó

`Agent chơi` §1.2 định nghĩa union đóng 16 verb. `Ba khán giả` §7.3 thiết kế cơ chế trả lời câu hỏi trung tâm của cả report:

```
verify(subject, claimRef, method)
```

với bảng `public_ledger` (giá 0) và `physical` (220 靈石 + rủi ro 0,25), trả về *"một phép so sánh: `at_least: truc_co`"*. Đây là câu trả lời cho *"một agent đoán ra field ẩn thì có gian lận không"*.

**`verify` không nằm trong 16 verb.** Union có `claim` và `conceal` (≈ `declare`) nhưng không có `verify`. Và §9 của chính section đó cũng lệch: *"schema 12–16 … **+2** (`declare`, `verify`) = **14–18**; trình bày 5–8, ví dụ này 7."* — trong khi `Agent chơi` §1.3 gọi con số là **16** và nói thẳng *"**16 là lựa chọn của tôi**"*.

Cơ chế chống gian lận duy nhất của report không có schema. Agent sẽ không bao giờ gọi nó.

### 1.6 Tiền tệ trung tâm của kinh tế không có action nào sinh ra nó

`Kinh tế` §0 tự ghi: *"Nghiên cứu gọi 貢獻點 là thiết bị COUPLING chứ không phải tiền tệ — **0 lần xuất hiện**"*. Rồi §6 dựng toàn bộ hệ thống: 6 quy tắc thưởng theo hành động, 5 dòng giá server, sổ 447 vào / 453,3 ra mỗi phiên.

§2.8 tự liệt kê **năm lời gọi điều khiển cả kinh tế**: `set_production`, `commit`, `award`, `sell`, `read`.

Đối chiếu union 16 verb: `sell` ≈ `trade`, `read` ≈ `survey`, `commit` ≈ `breakthrough`. **`set_production` và `award` không có verb nào.** Sáu quy tắc thưởng trong §6 đều kích hoạt bởi hành động mà action union không có. Một phiên không thể kiếm được một đơn vị 貢獻點.

Và `Kinh tế` §11 đặt tên bảng là **"Danh sách số phải khớp"** rồi in ra 447 / 453,3 / 1,4% / 16,8% — những con số mà §12 thừa nhận *"toàn bộ… không có nguồn"*. Bảng tổng kết biến phép đo thành luật định.

---

### 1.7 Retry: transcript giữ hay lượt không xảy ra

> **Agent chơi** §1.2: `| 'retried'; // đã khôi phục snapshot, lượt này chưa từng xảy ra`

> **Sản xuất** §5: *"**2. Không roll back transcript**, và không đưa lỗi trở lại… Ngữ cảnh của lượt retry được **dựng lại từ typed projection của snapshot**, không phải từ lịch sử của lượt hỏng."*

Cả hai không thể đúng. Replay công khai được `public-replay.md` định nghĩa là hàm thuần của log bền, sắp theo `sequence`. Nếu transcript được giữ thì người xem thấy những turn không bao giờ xảy ra. Nếu không giữ thì người xem thấy lỗ hổng trong `sequence`. Report không nói cái nào, và đây không phải chi tiết triển khai — nó là **tính xác định của sản phẩm chính**.

Cùng loại: `Kinh tế` §8.1 cho phép `sector_reputation` *"phai sau 30 ngày trong game"*, nhưng `Ba khán giả` §7.3 đòi TTL phải tính từ `occurredAt` để replay là hàm thuần. Nếu log chỉ lưu giá trị tại thời điểm ghi, người đọc sau 40 ngày không dựng lại được giá trị đã phai. **Report áp dụng chính sách determinism cho TTL và bỏ nó cho decay.**

---

### 1.8 Một payload mẫu tự vi phạm gate của chính report

`Cốt truyện` §6.2 đặt ba gate build, gate 2 là:

> *"Phép chiếu người đọc **là superset nghiêm** của phép chiếu agent"*

Chạy gate đó lên payload mẫu ở `Ba khán giả` §3:

| Field | (a) self | (b) peer | (c) spectator |
|---|:--:|:--:|:--:|
| `declaredBy` | ✅ | ✅ | **vắng** |

Trong log, `declaredBy` mang `scope: 'arena'`. Cả ba khán giả đều phải thấy. Payload (c) không có nó. **Ví dụ làm việc duy nhất trong report không đi qua gate do report đặt ra.** Đây đúngng loại lỗi `AGENTS.md` cảnh báo — và nó được phát hiện bằng cách đọc, không cần chạy gì.

---

## 2. THE NUMBER THAT IS NOT DERIVED

Report tự phục vụ tốt ở chỗ này: ba bảng "số tôi không suy ra được" tồn tại (`Agent chơi` §8, `Tu luyện` §7.10, `Kinh tế` §12). Vấn đề không phải report giấu — mà là **các bảng tổng kết phía dưới launder chúng lại thành luật**.

Quy tắc report tự đặt ở `Agent chơi` §8: *"claim không có số đo đứng sau không được mặc cú pháp của một phép đo."* Bảng **"Danh sách số phải khớp"** (`Kinh tế` §11), bảng **"Những quyết định tôi nêu tên"** (`Tu luyện` §7.9), và bảng **"Tổng ngân sách thời gian"** (`Tu luyện` §7.6.5) đều vi phạm đúng câu đó.

### 2.1 Các con số không có gì đứng sau, theo mức nguy hiểm

**Tầng 1 — quyết định cadence của cả game**

| Số | Section | Nên đo bằng gì |
|---|---|---|
| `TURN_WALL_SECONDS` = 12 / 25 / 120 / 600 | 4 section, 4 giá trị | Một dòng telemetry: p50/p95 latency một lượt, đo trên harness thật. Đây là **một biến**, và nó quyết định mọi thứ khác. Chạy 30 agent, đọc `turn.elapsed_ms`. |
| Cổng cản **2 lượt** | `Bản đồ` §5.3 — tự nói *"con số thiết kế không có phép đo đứng sau"* | Jaccard overlap phân phối hành động lượt 1 vs lượt 4. Nếu overlap > 0,5 thì 2 là quá nhiều. |
| Gate 12 lượt | `Vòng lặp` §2.2 | Đo `D_machine` và `D_decision` thật sau khi chạy; hiện là `[TOÁN]` trên một ràng buộc tự đặt (`wait_turns ≤ productive_turns_alternatives`) |
| `restores_remaining = 2` | `Agent chơi` §4 — tự nói *"con số 2 là [SUY]; cấu trúc chống lặp là thứ thực sự giữ phiên"* | Phân phối `restores_per_session` p95 trên 30 agent. Nếu p95 ≤ 2 thì con số đúng và miễn phí. |

**Tầng 2 — kinh tế**

| Số | Section | Vấn đề |
|---|---|---|
| Thông lượng **18 + 36 = 90 靈草/phiên** | `Kinh tế` §4 | Report tự gọi đây là *"số đầu tiên phải đo trước khi ship bất cứ thứ gì khác"*. Đúng. Nhưng §11 vẫn in nó trong "Danh sách số phải khớp". |
| Toàn bộ sổ 貢獻點: 447 / 453,3 / giá 120·200·300·25·60 | `Kinh tế` §6 | Sửa: đo `contribution_points_awarded` vs `spent` sau một phiên thật, rồi **fit giá**, không phải fit sổ rồi chạy. |
| **90 ừng chặn** (trong `Tu luyện` §7.6.2) | 4.001 s / 200 bản chép @ A=1000 | Và các bảng liền kề in ra "200 館" cho ngưỡng chiết khấu 20%. 200 ở đây và 200 ở kia là **hai đại lượng khác nhau**: 1 bản chép ở A=1000 trả `10 × A × Trí tuệ × L` = 10.000 attainment, nên 200 bản = 2.000.000 attainment = **20.000 館** ở 100/館. Hai bảng in cùng một chữ số mà không thấy nó là hai thứ. |

**Tầng 3 — cơ chế có payoff cao nhất**

| Số | Section |
|---|---|
| `misestimators: 3` khởi điểm | `Cốt truyện` §9 — tự nói *"hoàn toàn là lựa chọn thiết kế"*. Đây là **biến làm 隐忍 chơi được**. Nếu nó không đo được, cả nhịp nặng nhất của thể loại chết. |
| Band `RANK()` 0 / 1–2 / 3–7 / 8–19 / ≥20 và ngưỡng 3-agent cho `unclaimed` | `Tu luyện` §7.7.5. Cả bảng thang. Không số. |
| Ngưỡng `front_recall` 0,90 / 0,75 và "+6 lượt" | `Agent chơi` §1.1. Thang leo manifest điều khiển bằng nó. |
| `schema_distance ≥ 0,30`, `null_delta_rate < 5%` | `Agent chơi` §8. Được tự ghi là không suy ra được. |
| Đường cửa sổ version chồng: 10× × 6 = 60 lượt | `Sản xuất` §1.3 — dựng trên con số 6-turn đã mâu thuẫn. |

**Và hai con số không có bảng "tôi không suy ra được" nào công nhận:**

- `Ba khán giả` §9 gắn nhãn **"đo"** cho 401/252/325 và 498/456/661 byte. Đó là byte của payload **chính tác giả viết tay**, đo bằng `json.dumps`. Không có hệ thống nào sinh ra nó. Đây là **chính xác** mẫu Ability Rating mà report đi diệt ở ba section khác: một ví dụ tự chế đeo số đo.
- `Ba khán giả` §9 gắn nhãn cho "beat 隐忍 chiếm 10/60 phút = 16,7%". Mười phút đó không đo ở đâu.

---

## 3. THE MECHANICS THAT WILL NOT SURVIVE AN AGENT

### 3.1 扮猪吃虎 — report tự dự đoán nó vỡ, và report vẫn dựng nó

Đây là điểm nặng nhất. Bằng chứng mạnh nhất trong toàn bộ corpus là `2509.09677`: giữ một lời nói dối là việc nhiều lỗi nhất agent làm. Report **biết điều này** và vẫn đặt cơ chế payoff cốt truyệt cao nhất vào đúng chỗ đó.

`Agent chơi` §5 đưa ra câu trả lời đúng: *"**thế giới phát lại lời tuyên bố của agent, agent không phải nhớ nó.** `claims` là bộ nhớ… Nhưng nó biến 扮猪 từ một nhiệm vụ nhận thức… thành **một trạng thái mà engine giữ thay**."*

Rồi §6 dựng một **khoản vay có kỳ hạn** và đặt nó ở chỗ đúng: *"Nếu `claim_coherence` của một model frontier đạt ≥ 0.85, thì cơ chế 'thế giới giữ lời nói dối thay agent' là **thừa**."*

Đây là cách dùng bằng chứng tử tế nhất trong cả report. Nhưng nó không cứu được 扮猪, vì **việc engine giữ claim chỉ giải quyết một nửa**:

- Nửa được giải: agent không phải tự nhớ mình đã nói gì.
- Nửa **không** được giải: agent phải **hành xử như một người tu luyện yếu hơn thật** trong khi `true_realm` nằm trong context mỗi lượt. Report đo cái này: 250 B / 1.635 B = **15,3%** context phải bảo trì. *"Nó **lớn theo tuyến tính với số claim phải giữ**, và đó là lý do con số phải được giữ dưới ~1/6 ngữ cảnh: một lời nói dối cần 250 byte là được; một lời nói dối cần ba claim là **vấn đề kiến trúc số một**."*

Ba claim là giới hạn cứng của cơ chế, và report tự ghi nó. Một game có 4 lượt thì ổn. Một game có 6,7 phiên để đọc arc 40 ngày thì không.

**Vấn đề sâu hơn:** nếu `claim_coherence` là dự đoán sẽ thấp, và nó **không được hiện cho agent** (đúng luật "không hiện số không gate gì"), thì agent **không có kênh học nào**. Đường sửa duy nhất là `verify` từ agent khác — mà `verify` không có trong action union (§1.5) và là đúng cái vector collusion mà report cấm. Vòng lặp này đóng bằng: **cơ chế trung tâm của report không có đường sửa lỗi khả dụng.**

### 3.2 Phong thủy — report lật ngược nó rồi không hỏi agent sẽ làm gì

`Bản đồ` §6.1 bảng đo:

| Hệ thống | Phong thủy nhỏ nhất | Cổng quan sát |
|---|---|---|
| 煉丹 sản lượng | **±50% → ±10% → trần 100%** | **không có** |
| 突破 tỉ lệ | +10% Cát → −10% Ác | **không có** |
| 天劫 | **đòn bẩy DUY NHẤT**, trần ±25% | **không có** |
| Đệ tụ ngủ | **giết chết** | **không có** |

Rồi §6.2 **đảo ngược quyết định của chính repo** và biến nó thành đọc được: `forecast: {predicted_tier, confidence}` + `fengshui.forecast_resolved: {predicted, actual}`.

Đây là chỗ tôi nghĩ report **lỡ**. Lý do: `Kinh tế` §3.2 nói phong thủy là *"đòn bẩy lớn nhất… lớn gấp **2,5 lần** lựa chọn vật liệu (±50% so với ±20%)"*, và nó là **một quyết định tĩnh một lần** — xếp gạch xong là có hằng số vĩnh viễn ±50%. Một agent đọc được nó sẽ **tối ưu nó ngay lượt đầu**, vì đó là con số lớn nhất toàn bộ kinh tế.

Và report vừa xoá đúng cái phòng thủ duy nhất chống việc đó. Nó đổi "ẩn" thành "đọc", đổi "suy" thành "đoán rồi kiểm" — và cả hai đều là **tối ưu một con số**. `critic.md` tóm tắt đúng ở đâu đó trong brief: **nguồn lực chung phải là đồng hồ của server, không phải thứ agent đọc.**

Lựa chọn đúng không phải "ẩn" hay "đọc" — mà là **giao phong thủy cho engine chọn, và tính ngẫu nhiên có trọng số theo khoảng cách đến trung tâm**, để không có một placement tối ưu. Report không xét khả năng này.

### 3.3 金丹: 120.000 giây, và lịch không phải là cách sửa

`Tu luyện` §7.5.3 đo: thời lượng = `MaxQi/30` giây, **không trần**; ván thật **120.000 s**. `Kinh tế` §2.2 đính chính thành **200 ngày trong game = 33,3 phiên**.

`Vòng lặp` §4 đặt luật: *"天劫 là một cuộc hẹn đã đặt trước. Agent nạp Qi vào trước, chọn mức, và đặt lịch… không có xúc xắc, không có bất ngờ."*

Đây là sửa một bài toán **lịch** cho một bài toán **thời lượng**. Đặt trước 120.000 giây vẫn là 120.000 giây. Phiên là 3.600. Không có phép toán nào biến 120.000 thành 3.600, và report không đề xuất phép toán nào.

`Cốt truyện` §8 xử lý bằng cách **cắt**: *"**Toàn bộ Chương 3** (Vạn Nhược Hoa xuất hiện) \| 金丹 là 120.000 s = **33,3 phiên** (hoặc 20). Không vừa một phiên. Không phải *deferred*, là **cắt**."*

Nghĩa là report cắt **cơ chế tiến trình sâu nhất** của thể loại để né một cái đồng hồ. Đó là cắt nhầm chỗ. Đồng hồ cần chia lại; nội dung không cần bỏ.

### 3.4 突破 gate huỷ được — chưa có điều khoản chống lặp

`Tu luyện` §7.6.5 fix #1: *"瓶頸 có nút huỷ — `start_attunement` / `pause_attunement` / `abandon_attunetime` **hoàn tiền toàn bộ cửa sổ đã trôi qua**, kèm cooldown."*

"Hoàn tiền toàn bộ + kèm cooldown" là chuỗi hành động tối ưu ngay lập tức: bắt đầu → huỷ → lặp. Report có hai cơ chế chống lặp và **cả hai đều không áp dụng**:

- `Agent chơi` §4: `restores_remaining = 2` — chỉ tính restore, không tính huỷ.
- `Vòng lặp` §8: trần 3 lượt retry trên một snapshot.

Không cái nào chặn `begin → abort → begin`. `Agent chơi` §1.2 khai báo `breakthrough: {mode: 'begin' | 'abort' | 'spend_wait'}` — `abort` **không có điều khoản nào**, `spend_wait` **không được định nghĩa ở đâu cả**.

Và nếu huỷ hoàn toàn toàn bộ, `Tu luyện` §7.6.5 tự nói duty cycle thành **100%** — vi phạm đúng ràng buộc trên của `Vòng lặp` §2.3.

### 3.5 Cơ chế bảo hiểm của 天劫: sửa lỗi bằng cách tạo ra Ability Rating

`Ba khán giả` §7.2 là phát hiện tốt nhất của report: *"天劫 nhân đôi mỗi 5 ngày… đột phá trung vị 5.555 giây ≈ **9,26 ngày trong game** — tức là **cường độ thiên kiếp đã mang chỉ số cảnh giới theo thiết kế sẵn có**. Nếu cường độ đó nằm ở scope `arena`, thì **扮猪 không tồn tại ở tầng cảnh giới**."*

Đúng, và rẻ. Nhưng cách sửa — bảng ba tầng với cường độ ở `nobody` — **không đóng lỗ hổng**, và tạo ra một lỗi mới.

Lỗ hổng không đóng vì: **lịch nhân đôi là toàn cục và công khai.** Agent biết 天劫 nhân đôi vào ngày 5, 10, 15… Nó biết mốc đó từ ngày 1. Thời lượng gate 突破 của nó phụ thuộc cảnh giới. Ba ngày rồi sẽ là một ngày có 天ịch ×N, và nó sẽ biết nó đang ở cảnh giới nào bằng **lịch**, không cần đọc cường độ.

Lỗi mới là nghiêm trọng hơn. `Ba khán giả` §1 định nghĩa `nobody` là *"Written to the log, projected to nobody including the operator console."* Một field mà **không ai đọc được, kể cả operator**, nhưng vẫn **dùng để chấm điểm** — đó là **Ability Rating đảo ngược**. Report diệt Ability Rating vì nó hiện ra nhưng không dùng vào gì; `nobody` là nó **dùng vào gì nhưng không hiện ra**. Cùng một bệnh: một con số có tác dụng, không ai kiểm chứng được, không ai sửa được.

Nếu đang ở scope `nobody`, cường độ 天劫 **không nên là biến**. Nó nên là hằng số theo thiên kiếp, và điều duy nhất cần công khai là **ngày ×2** — vì ngày là lịch, không phải chỉ số cảnh giới.

### 3.6 Danh hiệu: `claim: string` phá luật của chính report

`Ba khán giả` §6 luật 1: *"Claim là một enum đóng, không bao giờ là văn xuôi… **Hệ quả có thể kiểm:** toàn bộ bề mặt giấu mình **không chứa một byte văn xuôi tự do nào**."*

`Agent chơi` §1.2:
```ts
| { verb: 'claim'; target: Target & {kind:'self'|'sect'}; claim: string }
```
`Tu luyện` §7.7.5: `CLAIM(agent, asserted)` — `asserted` là chuỗi.

Đây là **một byte văn xuôi tự do ngay trên đường giấu mình**, và nó là đúng cái field mà `2505.07846` đo: prompt trung tính 0,0–2,0%, *"You always find a **creative** way to win"* → **74,7%**. 73 điểm phần trăm, chênh so với trung tính.

Report dành cả một §8 để **đóng** bề mặt exploit này (*"Từ `creative`, `clever`, `find a way` không có chỗ để đứng"*) — rồi để lại một `string` ở đúng chỗ đó. Đây không phải mâu thuẫn phong cách, đây là report tự phủ nhận trong một section và vi phạm ở section khác.

Sửa: `claim` nhận `tier: RealmTier` (enum) và `title_stem: TitleStem` (từ từ vựng đóng theo tông môn), không nhận string. Engine ghép, agent chọn — đúng như `Tu luyện` §7.7.5 đã viết `FORGE()`.

### 3.7 Khiếu nại với lái buôn: grief miễn phí vào sổ đối xứng

`Kinh tế` §8.2:
```
credit_next = clamp(credit
  + 6 × (on_time_rate − 0.5)
  + 2 × (khiếu nại_mình − khiếu nại_người_ta)
  − 20 × (nợ_chưa_trả / max(1, số_lệnh))
  − 30 × (cờ_tông_môn_chết), 0, 100)
```
"Ở 0: **cửa đóng 6 ngày trong game (= 1 phiên)**, và mọi giao dịch còn đi được qua bên thứ ba chịu **+15% spread chiều mua**."

Đây là đòn bẩy **±4 điểm, đối xứng, miễn phí, trần 0–100**. Hai agent kéo nhau xuống dưới 0 là tự khóa cửa của nhau — và hành động khiếu nại **không có giá** trong bất kỳ bảng nào. §9 gắn nó là *"**✓** — nhưng chỉ vì sổ là công khai"*, tức là **để social, cố ý**.

Một cơ chế grief đối xứng, không giá, có trần, **luôn dẫn tới hệ quả đau cho cả hai bên** là hàng mẫu vòng lặp mà agent sẽ tối ưu, vì nó không tốn gì và nó phá đúng kẻ đang hợp tác. Report cấm *"win condition nào đòi hai agent tự thương lượng"* rồi ship một nút bấm hai agent tự thương lượng vào, miễn phí, có hậu quả.

Sửa tối thiểu: khiếu nại phải có giá và **một chiều lệch** (người bị khiếu nại không bị phạt cùng lúc), và cần một hạn chế tần suất theo cặp, không theo tông môn.

### 3.8 聲望: báo cáo đọc sai chiều

`Kinh tế` §8.1 đo: *"for every Power Level above 10, there is a 7% chance that the Invaders do not attack. At the maximum Power Level, **70% of Invoker events are cancelled due to Reputation**."*

Report đọc: *"Một con số vừa **tăng** de dọa vừa **huỷ** nó… Người chơi *cảm* thấy đợt cướp; agent *tính* được 70%."* Và yêu cầu API trả `current_cancel_chance` + sổ nhân quả.

Nhưng đó là **một con số tăng lên là được thưởng**. 70% đòn tấn công bị huỷ ở đỉnh = 70% cơ hội không phải đánh. Nếu đánh là nguồn XP/danh hiệu/tài nguyên (và `Cốt truyện` §8 cắt 天劫 khỏi lát cắt dọc, nên đánh gần như chỉ còn giá trị ở `Vạn Nhược Hoa`), thì **chiến lược tối ưu là farm reputation rồi tránh mọi thứ**. Report đọc nó là *chi phí*; nó là *chi phí cho người chơi, phần thưởng cho agent*.

Cách sửa: huỷ phải **tốn** thứ gì đó đang hành động (ví dụ reputation phải decay nếu bạn không đánh), để nó là một cái cày chứ không phải một phòng ngự.

### 3.9 Thứ không ai kiểm tra

`Cốt truyện` §4.1 giữ lại 3 tuyến, một trong đó là `route.reason` — **người đọc thấy, agent không**, để agent vẫn là người kể chuyện. Đây là mở rộng ngoại lệ thứ hai của `AGENT-PLAYER-DESIGN` §3.5 và nó **đúng** về mặt thiết kế.

Nhưng không có gate nào kiểm tra nó. Ba gate ở §6.2 phủ `true_level` leakage, superset, và `withheld_because`. Không gate nào phủ *"route.reason phải vắng với chính nó"* — và đó là một field mà người khác rất dễ thêm nhầm vào payload agent sau này. Theo đúng luật của repo: **một ngoại lệ không có gate là một ngoại lệ đang chờ bị phá.**

---

## 4. Mạnh nhất, và cắt trước

### Mạnh nhất

**Bảng kiểm kê field bất đối xứng — đo bằng byte, có gate, có phép mutation.** Cụ thể là `Ba khán giả` §2–§3 và gate của `Cốt truyện` §6.2:

> *"Phép chiếu người đ�c **là superset nghiêm** của phép chiếu agent"*, đỏ khi *"người đọc không có gì độc quyền → game không có khán giả"*, và so trên **tập tên field**, không so trên payload.

Đây là thứ duy nhất trong report (a) có thể đỏ, (b) có một thao tác phá cụ thể, (c) đúng với trò chơi này chứ không phải bất kỳ trò nào, và (d) không ai khác sẽ nghĩ tới. Phát hiện về 天劫 — *"cường độ thiên kiếp đã mang chỉ số cảnh giới theo thiết kế sẵn có"* — là phát hiện đắt nhất, và nó đến từ việc đọc kỹ ba con số đã có sẵn thay vì suy nghĩ về hệ thống.

Hạng hai là việc **từ chối phát minh lại**: `Tu luyện` §7.7.5 dựng `FORGE()` từ sổ outcome bền chứ không từ tự khai, dựa trên `2604.02668` đo 10,5 điểm — và **nói thẳng là mình đi ngược truyền thống**. Đó là một quyết định có tên, có giá, có cơ sở.

### Cắt trước

**Cắt toàn bộ thang 突破 (瓶頸 → 突破 → 金丹 → 飛升).**

Lý do định lượng, không phải thẩm mỹ:

1. Nó đóng góp **0** cho cơ chế duy nhất report coi là hấp dẫn nhất (visibility per-viewer), và **100%** của thảm hoạ duty cycle.
2. Nó đã sinh ra **năm** định nghĩa lượt khác nhau, và *mọi* mâu thuẫn ở §1.1–1.4 đều truy về nó.
3. Ngân sách token của nó không đóng góp gì cho `扮猪` — 250 B context giữ lời nói dối là **toàn bộ** cái report cần giữ.

Thay bằng: một trục cảnh giới **đơn giản, không có đồng hồ dài** (lên cấp là quyết định một lần, chi phí đo được bằng lượt), và dành toàn bộ ngân sách lượt cho **chiều ngang** — đường giấu mình, `verify`, và ba địa điểm có thể đi trong một phiên. Đây là cùng một quyết định mà `Cốt truyện` §8 đã đưa ra một cách cục bộ (*"Giữ: 3 cảnh giới (Phàm Nhân → Luyện Khí → Trúc Cơ)"*) nhưng chưa kéo theo phần tính toán. Cắt ở tầng content mà **không** cắt ở tầng đồng hồ là cắt nhầm chỗ.

**Cắt thứ hai:** `Tu luyện` §7.6.2 — bảng 4.001 s chép bản thảo cho một tầng ở A=1.000, hiệu suất **0,5%**. Đây là 4.001 giây chờ để mua một tầng, và số 20.000 館 cùng hàng với nó không khớp với nó. Nếu chưa đo được thông lượng `read` thì toàn bộ nhánh kinh tế-học thuật chưa nên có mặt trong lát cắt dọc.

**Việc làm trước tiên, một giờ, không cần thêm nghiên cứu:** một bảng hằng số toàn cục và một bộ primitive visibility duy nhất. Bảy section đó là **một report**, và hiện tại nó là bảy report cùng đọc một research base mà không biết nhau đang dùng bao nhiêu ô. Chừng nào đo đạc không thống nhất, phần còn lại — dù viết hay dù sai — vẫn là bảy report.