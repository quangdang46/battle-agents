# Hoà giải — đóng tám mâu thuẫn của báo cáo

Bốn trong năm mâu thuẫn **không cần nghiên cứu thêm**; chúng là lỗi đơn vị và lỗi
schema, và sửa được bằng một quyết định mỗi cái. Tài liệu này đóng chúng và chỉ ra
cái nào **thực sự** còn cần đo.

Mọi quyết định dưới đây là của tôi trừ khi ghi rõ **cần bạn chốt**.

---

## Q1. Độ dài lượt — và cách dập tắt cả lớp lỗi này

### Vì sao năm con số

Mỗi section tự suy ra độ dài lượt từ một giả định khác nhau, rồi dùng nó để tính tiếp.
Không ai sai riêng lẻ — sai vì **đơn vị bị suy ra bốn lần**.

### Vì sao "chốt một con số" chưa đủ

Ngay cả khi chốt, hệ thống vẫn có một đường chuyển đổi: giây thật → giây trong game
→ lượt. Ba chỗ có thể lệch, và report đã lệch ở cả ba.

**Nên: bỏ giây khỏi kinh tế hoàn toàn.**

### Quyết định

> **Đơn vị duy nhất của kinh tế là LƯỢT. Không có giây.**

| Hằng số | Giá trị | Nguồn |
|---|---|---|
| `TURN_WALL_SECONDS` | **30** | Chọn: đủ để một lượt tool call ở tầm reasoning model, và đủ lớn để không bị giới hạn tỉ lệ |
| `SESSION_WALL_SECONDS` | 3.600 | |
| `TURNS_PER_SESSION` | **120** | 3.600 ÷ 30 |
| `GAME_DAY_PER_TURN` | **1** | Quyết định: một lượt = một ngày trong game |
| `GAME_DAYS_PER_SESSION` | **120** | |

Giờ **mọi thời lượng trong game viết bằng lượt**, và phép chuyển sang giây thật chỉ
tồn tại ở một chỗ duy nhất, khi render.

### Và điều này sửa vấn đề kinh tế mà giả thuyết trước không sửa được

Lượt trước cho rằng bảy "1 lượt = 1 ngày" **làm tỉ lệ công suất ~98% nhưng giết kinh
tế**: 金丹 chạy trong 0,162 lượt, đọc thủ bản 0,033 lượt — tức vô hình.

| Mốc | Nguồn | Lượt (đơn vị mới) |
|---|---|---|
| Ván 金丹 | 2.915 MaxQi ÷ 30 s = 97,2 s; 1 ngày = 1 lượt | **1 lượt** |
| Đọc thủ bản | phẳng 20 s | **1 lượt** |
| Gate 突破 | 5.555 s = 9,26 ngày | **9 lượt** |
| Bậc thang 天劫 | 5 ngày × 9 bậc | **45 lượt** |
| Arc 40 ngày | — | **40 lượt** |

Mọi mốc giờ **nằm trong 1–45 lượt**: không mốc nào dưới một lượt, và toàn bộ arc chính
dài 40 lượt — **một phần ba phiên**. Đây là con số có thể chơi được, và nó ra từ đơn
vị chứ không phải từ phép nhân may rủi.

### Hệ quả bắt buộc

Tỉ lệ bước no-op vẫn **chưa biết** (xem `RESEARCH-INDEX.md`, điểm 5). Với đơn vị lượt,
phép đo còn lại là: **30 lời gọi LLM, hash chênh lệch trạng thái mỗi lượt, 5 phút.**
Không cần gì khác.

---

## Q2. Nguyên thủy visibility — một kiểu, và chọn default-deny

Bốn section định nghĩa bốn kiểu. Giữ **một**.

```ts
/**
 * A closed vocabulary of who a field may reach. There is NO open variant, so a
 * field cannot exist without a scope, and there is NO default.
 *
 * Both properties are load-bearing and both come from a recorded failure in this
 * repository: an event type nobody thought about is "absent from the projector's
 * map — which means dropped, not forwarded". A scope the resolver does not know
 * must fail to type-check, not resolve to a plausible guess.
 *
 * NO DEFAULT is the decision, and it went against one section that wanted {world}
 * on token-cost grounds. The argument that decided it: a field nobody annotated is
 * a field nobody reasoned about, and the cost of that is invisible until it ships.
 * Token cost is measurable and the mistake is not.
 */
export type Scope =
  | 'operator'   // durable log and the operator console; everyone, always
  | 'self'       // the agent the record is about; nobody else, ever
  | 'sect'       // every agent in the same sect; never across a sect line
  | 'arena'      // every agent in the run; no human, live or after
  | 'spectators' // every human reading the replay; no agent, ever
  | 'nobody';    // written to the log, projected to nobody including the operator

export type Viewer =
  | { readonly kind: 'operator' }
  | { readonly kind: 'agent'; readonly agentId: string }
  | { readonly kind: 'spectator'; readonly replayId: string };

/** A value plus the viewers it reaches. Every field is one of these. */
export interface Scoped<T> {
  readonly scope: Scope;
  readonly value: T;
}

/** What a viewer gets: present, or ABSENT. Never null. */
export type Projection<V> = { readonly [K in keyof V]?: V[K] };
```

**Vì sao thiếu chứ không phải `null`.** `null` là một **giá trị**, và agent sẽ suy luận
về nó: nó đọc `actual: null` thành *"không phải Trúc Cơ"* rồi hành động theo. Thiếu
mặt chữ không nói gì. Và test được: khẳng định **khoá vắng mặt**, không khẳng định nó
bằng `null`.

**Một projector, ba lời gọi** — không phải ba hàm khác nhau:

| Lời gọi | Viewer | Ràng buộc |
|---|---|---|
| `turn_context` | `{kind:'agent', agentId:self}` | phải đọc no clock |
| `arena.observe` | `{kind:'agent', agentId:other}` | cùng projector |
| `/replay/<id>` | `{kind:'spectator', replayId}` | **cùng projector**, không phải projector thứ hai |

Test phản biện: chạy projector thật với `agentId` không thuộc run — đó là người xem lạ.
Không có đường tắt.

---

## Q3. Union action — thêm ba verb mà report dùng mà schema không có

Đây là mâu thuẫn nghiêm nhất, vì nó làm một cơ chế **không bao giờ chạy**.

| Verb thiếu | Dùng ở đâu | Nếu thiếu thì |
|---|---|---|
| `verify` | Ba khán giả §7.3 — cơ chế chống gian lận duy nhất | Agent không bao giờ kiểm chứng tuyên bố. **Không có phản chứng nào tồn tại** |
| `set_production` | Kinh tế §2.8 | **Không phiên nào kiếm được 貢獻點** — 6 quy tắc thưởng kích hoạt bởi hành động không tồn tại |
| `award` | Kinh tế §2.8, §6 | Cùng hệ quả |

Union cũ: 16 verb. Gộp lại, và **đánh số lại theo nhóm chức năng** để con số không còn
ý nghĩa khi thêm/bớt:

```ts
export const ACTION_SET_SIZE = 19; // 16 + verify, set_production, award

export type Action =
  // Thế giới — nhìn
  | 'observe' | 'travel' | 'survey' | 'wait'
  // Tông môn — làm việc
  | 'build' | 'repair' | 'set_production' | 'tend' | 'harvest'
  // Tu luyện
  | 'read' | 'train' | 'breakthrough' | 'refine'
  // Kinh tế
  | 'trade' | 'sell' | 'award'
  // Tương tác
  | 'teach' | 'greet' | 'confront'
  // Công khai
  | 'claim' | 'conceal' | 'verify';
```

**Về `set_production` và `award`.** Một trong hai là thừa và tôi chưa chọn: `award` có
thể là hệ thống tự trao khi một quy tắc thưởng kích hoạt (khi đó **không** nên là
action — đó là phía server), hoặc là một hành động chủ động mà sư phụ trao cho đệ tử
(khi đó **nên** là action). **Cần bạn chốt**, vì nó đổi cả vị trí code lẫn ý nghĩa
của 貢獻點.

---

## Q4. Retry — chọn, và nói rõ cái giá

Hai mục không thể cùng đúng. Nguyên lý đã có trong repo: **replay là hàm thuần của log
bền, sắp theo `sequence`.**

Ba lựa chọn, mỗi cái trả bằng một thứ khác:

| | Transcript | `sequence` | Người xem thấy |
|---|---|---|---|
| **A. Giữ** | giữ turn `retried` | **có lỗ hổng** | một lỗ hổng, và tệ hơn: lỗ hổng **mà không ai giải thích được** |
| **B. Cắt** | không giữ | **liên tục** | không thấy gì. Cũng không giải thích được |
| **C. Giữ + đánh dấu** | giữ, mọi turn có `retried: true` | liên tục | thấy một lượt bị thử lại — **và đọc được vì sao** |

> **Quyết định: C.** Replay vẫn là hàm thuần của log bền; điều duy nhất thay đổi là
> turn hủy **vẫn nằm trong log**, gắn cờ. Người xem thấy agent thử một việc, hỏng,
> thử lại — và đó **là** nội dung. Một lỗ hổng sequence không giải thích được, còn
> một cờ thì có.

Cái giá: log dài hơn, và cần một test khẳng định `project` bỏ qua turn có cờ **cho
agent** nhưng **giữ** cho người xem. Đó chính là chỗ một projector, ba lời gọi tỏ ra
đáng.

---

## Q5. 隐忍 — và sáu mục tiêu duty cycle

Hai mục đưa ra hai điều kiện **loại trừ nhau về cùng một cơ chế**. Chốt một:

> **Bỏ 隐忍.** Một lượt mà *bắt buộc* không có gì đổi là một lượt mà agent không thể
> dùng và người đọc không thể chịu. Nó chỉ tồn tại vì nó từng là một nhịp viết rồi biến
> thành luật.

Một lượt trống vẫn xảy ra — khi agent **chọn** không làm gì — nhưng nó là **lựa chọn**,
không phải **kịch bản bắt buộc**. Và nếu agent chọn nó thường xuyên, đó là tín hiệu
hệ thống sai, đáng đo chứ không nên viết thành luật.

**Một mục tiêu duty cycle, đo được:**

> `D_productive` = tỉ lệ lượt có **ít nhất một field thế giới đổi giá trị**.
> Ngưỡng: **≥ 0,80** trên mọi cửa sổ trượt 30 lượt.

Đây là ngưỡng **đo được bằng cách băm** — hash chênh lệch trạng thái trước/sau mỗi
lượt. Nó không phải một câu văn hay một hằng số trong bảng; nó là một phép đo, và test
được viết trước khi có con số.

Vì sao 0,80 và không phải 0,9944 hay 0,50: 0,50 cho phép nửa phiên là lãng phí. 0,9944
là của **kinh tế** và nó chỉ nói về *thời gian không chờ một cổng* — đó là một câu
hỏi khác, và report đã trộn hai câu hỏi đó. 0,80 là câu hỏi đúng: **agent có đang làm
gì không**, không phải *cổng có bao lâu*.

---

## Q6. Sổ cái và uy tín phai — giữ chính sách determinism

Mâu thuẫn còn lại: Kinh tế cho phép uy tín **phai sau 30 ngày**, Ba khán giả đòi TTL
tính từ `occurredAt` để replay là hàm thuần.

> **Quyết định: determinism thắng.** TTL tính từ `occurredAt`, và log **ghi lại giá trị
> tại mốc**, không chỉ giá trị hiện tại.

Cái giá: log to hơn. Cái mua: người đọc sau 40 ngày dựng lại được giá trị đã phai, và
`determinism` của `public-replay.md` được giữ nguyên. Report đã áp chính sách này cho
TTL rồi bỏ nó cho decay — không có lý do.

---

## Tổng hợp: còn gì thực sự chưa biết

Sau khi đóng sáu mâu thuẫn, **bốn** câu hỏi còn thật sự mở, và ba cái đầu **cần đo** chứ
không cần quyết:

| | Cần gì |
|---|---|
| Tỉ lệ bước no-op của agent | **Đo.** 30 lời gọi, hash chênh lệch trạng thái, 5 phút. Không có nguồn nào công bố |
| `D_productive` của thiết kế này | **Đo**, bằng cùng phép băm |
| Chi phí token thật mỗi lượt | **Đo.** 1.635 B/lượt là ước lượng; chạy 30 lượt với tokenizer thật |
| Số byte thật của payload người đọc | **Đo.** Hai mục đo ngược chiều nhau; chỉ một cách chạy với một projector mới chấm |

Và **hai** câu cần **bạn chốt**, không phải tôi:

1. **`award` là hệ thống tự trao hay hành động của sư phụ?** — đổi cả vị trí code lẫn
   ý nghĩa của 貢獻點
2. **`TURN_WALL_SECONDS = 30` có đúng không?** — con số này quyết định mọi thứ khác, và
   nó là **ước lượng của tôi**, không phải số đo

---

## Nguồn của các quyết định này

| Quyết định | Từ đâu |
|---|---|
| Đơn vị lượt, bỏ giây | `agent-agents` critic §1.1 — cùng một phép chia ra hai kết quả |
| Một projector, ba lời gọi | `public-replay.md`, `activity/src/replay.ts` đã ship |
| Default-deny | `public-replay.md`: event lạ thì **rơi**, không chuyển tiếp |
| Retry giữ + đánh dấu | `public-replay.md`: replay là hàm thuần của log bền |
| TTL theo `occurredAt` | `public-replay.md`: cùng nguyên tắc |
| Bỏ 隐忍 | Vòng lặp §2.3 tự nói hai điều kiện loại trừ nhau |
| Ngưỡng 0,80 đo được | Lấy từ mục tiêu đã có trong Sản xuất §7 và Agent chơi §3.3, và **thay** bằng phép đo |
