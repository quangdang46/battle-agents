# Research — Đạo Lộ: Vạn Tiên

> # ⚠️ TERMINOLOGY — CRITICAL, ĐỌC TRƯỚC MỌI THỨ KHÁC
>
> **`沙雕动画` KHÔNG có nghĩa là sand animation.**
>
> Trong dự án này, `沙雕动画 / 沙雕修仙动画` chỉ một thứ: **thể loại/phong cách animation
> Internet Trung Quốc — hài, absurd, ngớ ngẩn — với nội dung tu tiên.**
>
> `沙画` và `沙动画` là **hai khái niệm khác**, chỉ về hội họa trên cát và hoạt hình cát.
> **Không phải hướng sản phẩm.** Đừng suy ra cát thật, bàn đèn, hay stop-motion bằng cát.
>
> Chi tiết và nguồn: **§14**.

---

## Cách đọc tài liệu này

Đây là **nguồn chân lý duy nhất cho nghiên cứu của dự án**. Từ giờ **mọi nghiên cứu mới đều
viết vào đây**, không mở file mới.

| | |
|---|---|
| ✅ **ĐÃ NGHIÊN CỨU** | có nghiên cứu thật, có nguồn, **đã qua skeptic** |
| 🟡 **SỢ** | có một nhánh, chưa đủ để dựng lên |
| ⬜ **CHƯA NGHIÊN CỨU** | **không có gì.** Chỉ có câu hỏi. **Đừng trích như sự thật** |

| § | Nội dung |
|---|---|
| [1](#1-scope) | Scope — ba giới hạn chi phối mọi cơ chế |
| [2](#2-đạo-lộ-vạn-tiên--ý-tưởng) | **Ý tưởng game** |
| [3](#3-hướng-nghệ-thuật--沙雕修仙动画) | Hướng nghệ thuật, cây breakdown, ba lớp corpus — **⬜ chưa nghiên cứu** |
| [4](#4-vực-của-thể-loại) | Vực thể loại: 12 cụm từ, 41 hệ thống, 15 ràng buộc, 20 cái đừng copy |
| [5](#5-chất-nền-rpg) | Chất nền RPG: vật phẩm, 16 mô hình cấp độ, 20 chỉ số, 25 quy ước |
| [6](#6-cơ-chế-chuyển-hình) | Cơ chế chuyển hình — dựng → xoá → thay trạng thái |
| [7](#7-agent-là-người-chơi) | Sáu thay đổi khi agent là người chơi |
| [8](#8-sáu-mâu-thuẫn-đã-đóng) | Sáu mâu thuẫn đã đóng |
| [9](#9-bằng-chứng-đã-bị-bác) | **Những chỗ nghiên cứu tự đánh lưa mình** |
| [10](#10-còn-gì-chưa-biết) | Phép đo và trình tự |
| [11](#11-nhân-vật-và-cốt-truyện-chương-1) | Nhân vật và cốt truyện chương 1 |
| [12](#12-phản-biện-đợt-0) | Phản biện đợt 0 — bài học về phương pháp |
| [13](#13-báo-cáo-gốc--phần-còn-dùng) | Báo cáo gốc — phần còn dùng |
| [14](#14-chốt-thuật-ngữ--đầy-đủ) | Chốt thuật ngữ |
| [15](#15-tiền-lệ-đã-ship--4thfevercultivation-world-simulator) | **Tiền lệ đã ship** — một thế giới tu tiên toàn Agent LLM, free trên Epic. Xác nhận cả hai câu hỏi mở của ta |

---

# 1. Scope

Nghiên cứu phục vụ một game tu tiên **có agent LLM làm người chơi**, người xem là con người đến
muộn. Ba giới hạn chi phối mọi cơ chế:

1. **Không scalar sức mạnh.** Luật đã ship trong repo: một khi con số xếp hạng tồn tại, mọi hệ
   khác trở thành hàm của nó. Xem `packages/features/progression/src/rules.ts`.
2. **Đơn vị duy nhất là lượt.** Không có giây trong kinh tế.
3. **Không cơ chế nào đòi thương lượng tự do giữa các agent.** LLM chơi tốt game lợi ích riêng
   tư, chơi kém game cần phối hợp.

---

# 2. Đạo Lộ: Vạn Tiên — ý tưởng

Một thế giới tu tiên **bền vững**, nơi **người chơi là LLM agent**. Chúng nhận bounty, luyện đan,
ký giao khoán với nhau, nói dối về cảnh giới của mình, và chết. Bạn — **một con người đến
muộn** — không chơi. Bạn **đọc lại** những gì đã xảy ra.

Điều đó không phải chọn lựa thẩm mỹ. Nó là hệ quả của một phép đo: LLM chơi tốt các game
**lợi ích riêng tư** và chơi kém các game **cần phối hợp** (Nature Human Behaviour 2025). Nên
mọi thứ được thiết kế để **một đàn agent chơi được mà không cần nói chuyện với nhau** — chúng
đọc cùng một cái lịch, và hệ thống phán quyết bằng vị từ, không bằng thương lượng.

## 2.1 Cảnh giới là một mạch, không phải một thang

Theo nguyên văn `内丹`, **`筑基` — bậc thứ hai của thể loại — không phải một bậc, mà là hành
động mở một mạch tuần hoàn** (任督). Độ khó là **thuộc vị trí, không phải số**: cùng linh lực,
cùng cảnh giới, hỏng ở node khác nhau tùy đường bạn đi tới. Ba cổng — 尾闾 → 夹脊 → 玉枕 — và ở
cổng đầu, khí có **bốn lối ra, một lối là lối chết**.

Nên **một lượt là một động từ áp lên một nút của một mạch**, không phải tiêu một điểm chỉ số.
Động từ là **火候**: 武火 / 文火 / 沐浴 / 止火. Bốn lựa chọn, mỗi cái mở đúng một hướng, mỗi
cái mang một cái giá khác nhau, và cái giá **không cân bằng** — vì thế tranh luận là có thật.

Thang cảnh giới vẫn còn, nhưng nó mua **quyền**, không mua **số lớn hơn**: bậc kỹ thuật cao
hơn, thêm một ô, thêm một trận pháp. **Không có nhân sát thương nào theo cảnh giới** — chi tiết
và nguồn ở **§5**.

## 2.2 Thân thể là một đồ thị

Kinh mạch: **mười hai kinh, mỗi kinh có huyệt tên, phải mở đúng thứ tự** — và `烟雨江湖` ship
một viên `逆元丹` **lật chiều một kinh đã mở**.

> Cùng một vật thể. Khác chiều. Khác tính chất. **Một boolean. Một vật thể tiêu hao.**

Và `冲穴` thất bại **vẫn cộng năm bước tiến độ**.

## 2.3 Về đấu

Agent **không đánh nhau bằng sức mạnh**. Ba cơ chế, tất cả đã ship ở đâu đó, tất cả có văn bản
chính thức:

1. **Hằng độ khó, chọn trước và thấy trước khi nhận.** Không có bảng chỉ số quái — cuộc chạm
   là một hằng đã tác giả.
2. **Một loại sát thương có tên, bỏ qua cơ chế giảm của cảnh giới.** Nguyên văn: 「灼烧流也能
   **随意碾压**金丹天机阁修士」. Và một mod năm 2026 tồn tại **chính là để thêm** cơ chế chế ngự
   theo cảnh giới, vì game gốc không có.
3. **Phán quyết đọc từ bộ đếm hoặc đồng hồ, không bao giờ từ phép so sánh.**

Và trận thường **không phải một trận đánh** — nó là một **cổng thông lượng**: bộ HP cố định,
và câu hỏi là **mỗi lượt bạn đẩy bao nhiêu**.

## 2.4 Về lòng nói dối

Đây là phần không phải tu tiên. Một field không mang **giá trị + cờ ẩn**. Nó mang **một tập
người xem**:

```ts
type Scope = 'operator' | 'self' | 'sect' | 'arena' | 'spectators' | 'nobody'
type Projection<V> = { readonly [K in keyof V]?: V[K] }   // thiếu, KHÔNG phải null
```

Không có mặc định ⇒ **mặc định là từ chối**. Field bị giấu thì **vắng mặt**, không phải `null`
— vì `null` là một *giá trị*, và agent sẽ đọc `actual: null` thành "không phải Trúc Cơ" rồi
hành động theo nó.

`you.true_realm` hiện với **chủ nó và người xem**. Không agent nào đọc được của agent khác — kể
cả người cùng tông môn. Hệ quả: **người đọc muộn biết sự thật mà không agent nào biết.**

Về **danh hiệu**: thế giới khoá tên, agent chỉ `claim`. Không agent nào tự viết tên — nó khai
báo, hệ thống sinh từ hành vi. Bốn số `grantedBy`, `recognisedBy`, `resentBy`, `unclaimed`.
Đây là cụm **rẻ nhất và giá trị cao nhất** ta có, và nó **không mang con số quyền lực nào**.

## 2.5 Một phiên

**120 lượt, 30 giây một lượt, một ngày trong game mỗi lượt.** Agent mở context, nhận thế giới
đã chiếu theo đúng người xem của nó, chọn một 火候 và một hành động, rồi lượt đóng lại.

Không permadeath — chết thì **snapshot được giữ** và nó chạy lại từ đó, với cờ trong log;
người xem thấy lượt đó bị thử lại và **đọc được vì sao**. Đợt 40 lượt, agent phải **hiện diện ở
tất cả 40**.

## 2.6 Những thứ bị cắt, và vì sao

| Cắt | Vì sao |
|---|---|
| **Power score** (战力) | Một khi con số tồn tại, mọi hệ khác trở thành hàm của nó. Meta công bố của chính thể loại là bằng chứng: người chơi **tự tháo pet và 神ông** để số hiển thị thấp xuống cho bracket |
| **Permadeath** | Agent không học được từ một save hỏng — và lỗi trong context của chính nó làm tỉ lệ sai **tăng**, không giảm khi scale |
| **Mặc cả và thương lượng tự do** | Agent không bao giờ hội tụ và nhượng quá mức. Thay bằng **sổ lệnh có độ sâu** — nhưng phải có trần dân số, vì kẻ giết sổ lệnh là **cartel âm thầm**, không phải thị trường chết |
| **Stamina, VIP, 月卡, 签到** | Đồng hồ agent không quan sát được là **thất bại im lặng** |
| **Cửa sổ chờ tính bằng năm** | Không agent nào giữ được một *甲子* |
| **Cổng chặn theo thứ hạng giữa người** | Cổng là hàm của **trạng thái chính bạn**. Kệ sách tông môn chặn theo cảnh giới của người đọc — canon ở bốn tác phẩm không liên quan |

## 2.7 Những chỗ chưa có tiền lệ — và đó là lý do đáng làm

> **Một trận đấu có thể không scalar. Phần thưởng thì không — vì độ hiếm là một thứ tự.**

Thể loại **chưa từng ship một trận boss không scalar**, ở bất kỳ game nào, ở cả 31 domain đã
quét. Nửa chiến đấu đã giải xong bằng ba thiết bị ở §2.3; nửa phần thưởng thì chưa, ở bất kỳ
game nào. **Đó là khoảng mở lớn nhất mà ba đợt nghiên cứu tìm ra.**

Và một cái nữa, cũng chưa ai lấy: **đỉnh thang là một quyết định, không phải một điểm đến** —
cái giá rơi vào một tiền tệ **khác** với tiền tệ phần thưởng.

---

# 3. Hướng nghệ thuật — 沙雕修仙动画

> **⬜ CHƯA NGHIÊN CỨU.** Sản phẩm đi theo thể loại này. **Phương tiện không bị khoá vào cát** — xem §14.

**Ngày: 2026-09-30.**

> **⚠️ TÀI LIỆU NÀY CHƯA ĐƯỢC NGHIÊN CỨU.**
>
> Nó là **đặc tả hướng** và **câu hỏi nghiên cứu**, không phải kết quả nghiên cứu. Chưa có
> agent nào quét hệ sinh thái 沙雕修仙. Mọi khẳng định bên dưới về cách thể loại này chưa
> được kiểm, và những chỗ ghi **[CHƯA KIỂM]** phải được nghiên cứu trước khi dùng.
>
> Thuật ngữ: **`TERMINOLOGY-沙雕.md`**.
> Hai tài liệu nghiên cứu 沙画 đã bị xoá khỏi kho; những phần còn dùng được nằm ở `TERMINOLOGY-沙雕.md` §Nguồn.

---

#### 1. Hướng

Sản phẩm đi theo **沙雕修仙动画** — thể loại animation hài/absurd nội dung tu tiên. Đây là
nghệ thuật **tạp chí Internet**: nhân vật tu tiên, tiến trình tu luyện, gia nhập tông môn, đánh
nhau — kể bằng **giọng kể chuyện hài**, chuyển cảnh nhanh, và animation đơn giản.

Định dạng điển hình trong nhánh này [CHƯA KIỂM — cần quét hệ sinh thái để xác nhận tần suất]:

- nhân vật chính là người tu tiên
- đối thoại, chiến đấu, đột phá cảnh giới, gia nhập tông môn
- **narration / voice-over kể chuyện**
- biểu cảm và pose rõ ràng
- chuyển cảnh nhanh
- animation đơn giản, không phải điện ảnh đầy đủ
- joke, exaggeration, absurdity là **một phần của trải nghiệm**, không phải lớp phủ

Tập thường **2–5 phút**; series Bilibili có **hàng trăm tập** [CHƯA KIỂM].

**Không assume `沙雕动画` là một kỹ thuật render.** Nó là **genre/style + production format**.
Không có một visual pipeline duy nhất.

---

#### 2. Cơ chế chuyển hình — thứ độc lập với phương tiện

Đây là thứ **duy nhất** từ nhánh 沙画 mang sang được, và nó đúng bất kể dùng gì để vẽ:

> **Dựng lên → xoá → thay bằng trạng thái kế.**

Và không ai — **kể cả agent** — biết trạng thái trước đó từng tồn tại.

**Hai khái niệm này KHÔNG phải một, và tôi đã gộp nhầm một lần:**

| | Là gì | Ai chơi |
|---|---|---|
| **`扮猪吃虎`** | **trope kể chuyện** — giả yếu để che giấu thực lực | Agent, và nó được chơi bằng `Scope` chứ không bằng pixel |
| **dựng → xoá → thay trạng thái** | **cơ chế chuyển hình thị giác** | Renderer |

Chúng kết hợp được. Chúng không cùng tên.

---

#### 3. Câu hỏi nghiên cứu

> **Các video 沙雕修仙动画 / 沙雕漫 phổ biến hiện nay thực sự được cấu thành thế nào ở cấp độ
> scene / character / pose / expression / dialogue / camera / VFX / narration / sound?**

**Không** hỏi "làm animation cát thế nào". Đó là câu hỏi sai và nó dẫn vào ngõ cụt.

##### Cây breakdown cần lấp

```
Story
 ├── narration
 ├── dialogue
 ├── joke / absurdity
 └── cultivation progression

Scene
 ├── background
 ├── characters
 ├── props
 ├── pose
 ├── expression
 ├── camera
 ├── transition
 └── VFX

Character
 ├── reusable base
 ├── pose library
 ├── expression library
 ├── mouth states
 └── transformation states

Audio
 ├── narrator
 ├── character voices
 ├── SFX
 └── music

Visual storytelling
 ├── reveal
 ├── erase
 ├── replace
 ├── morph
 └── sudden transformation
```

**Nhánh `Visual storytelling` là nơi cơ chế §2 thuộc về** — và là nhánh phải điền trước, vì nó
là thứ ta mang sang từ nhánh cũ và không có gì để mất.

---

#### 4. Hệ sinh thái cần map

**[CHƯA NGHIÊN CỨU — đây là việc đầu tiên của đợt tới.]**

Hai nguồn Bilibili đã được biết tồn tại và là điểm khởi đầu:

| Nguồn | Nó cho ta gì |
|---|---|
| 「盘点**五十八部**高创好看的**修仙题材沙雕动画**及作者」 | 58 tác phẩm + creator |
| 「我一年刷了 4000 小时沙雕动画，盘点 **60 部**修仙沙雕必看榜」 | 60 tác phẩm |

Tên nổi bật trong danh sách đã thấy: `灵血修仙`, `回档修仙`, `法宝规则系`, `宗门食神`,
`穿越之后开网吧`, `山海归墟`, `大反派系统`, `阳寿降妖`, `系统延迟五百年`, `躺赢宗的修仙生活`,
`师兄绝非反派`, `师父你变了`.

**Đường đi đúng:** từ **hai danh sách đó** → 50–100 series/creator → **truy ngược từng series về
`原著` và tiểu thuyết gốc** → bảng:

```
series → 原著 → tác giả → nền tảng → định dạng animation → độ dài tập → cấu trúc scene
```

Đây hữu ích hơn nhiều so với gom những tiểu thuyết tu tiên nổi tiếng, vì nó cho **tên tác
phẩm + creator + hệ sinh thái thật** thay vì phải đoán.

`灵血修仙` (原创, **十缺废人**) nên là điểm vào đầu tiên: nó có series riêng, có mô tả nhân vật,
tông môn, chiến lực và setting — tức **metadata cấu trúc**, không chỉ lore.

---

#### 5. Corpus tiểu thuyết — ràng buộc pháp lý, đọc trước khi tải gì

**Không dựng crawler tải hàng triệu chữ từ nguồn lậu.** Tác phẩm như `凡人修仙传`, `仙逆`,
`一念永恒`, `修真聊天群` **đều có bản quyền**.

Phần được phép và phần **không** được phép tách rõ:

| | |
|---|---|
| ✅ **Được** | metadata · synopsis · **danh sách tên chương** · cấu trúc chương · nội dung đọc thử miễn phí chính thức · trích dẫn có dẫn nguồn |
| ❌ **Không** | archive toàn văn · corpus đầy đủ · tải hàng loạt chương từ nguồn không phải nhà xuất bản |

**Metadata và cấu trúc chương gần như đủ** cho việc này. Cái ta cần học ở một tiểu thuyết là
*tiến trình tu luyện, quan hệ, và cách một cốt truyện được nén thành scene* — và ba điều đó đều
đọc được từ synopsis + danh sách chương + tóm tắt cốt truyện.

Pipeline:

```
nguồn chính thức
   ↓
metadata · synopsis · tên chương
   ↓
phần văn bản được cấp phép truy cập
   ↓
trích: nhân vật · cảnh giới · địa điểm · phe phái · vật phẩm · kỹ thuật · xung đột · joke · chuyển scene
   ↓
cốt truyện → đồ thị scene
```

---

#### 6. Ba lớp corpus

Không gọi chung tất cả là "tiểu thuyết tu tiên". Ba lớp trả lời ba câu khác nhau.

##### Lớp A — canonical tu tiên
Lấy **bộ giọng** và **vốn từ**.

| Tác phẩm | Vì sao |
|---|---|
| **凡人修仙传** (忘语) | Mẫu rõ nhất của `凡人流`. Nhân vật sống bằng **tính toán, tài nguyên, cảnh giác** — và nghiên cứu đợt 1 đã kết luận động cơ tính toán này **chuyển được sang agent**, còn động cơ cảm xúc của `斗破苍穹` thì không |
| **仙逆** (耳根) | Hệ tu luyện, cảnh giới, pháp bảo, tông môn, sư phụ |
| **一念永恒** (耳根) | **Quan trọng nhất cho 沙雕** — chính nguồn nhà xuất bản mô tả tác phẩm chuyển từ nghiêm túc sang **幽默诙谐**, tạo tình huống bất ngờ |
| **我欲封天** (耳根) | Tiến trình + power fantasy phóng đại |
| **烂柯棋缘** (真费事) | Cổ phong仙侠, yêu tinh, thần tiên — vốn từ thế giới |

##### Lớp B — hài / absurd
Lấy **cơ chế hài**.

| Tác phẩm | Vì sao |
|---|---|
| **一念永恒** | Cùng tác phẩm, nhưng đọc theo trục hài |
| **修真聊天群** (圣骑士的传说) | Absurd **ngay từ cấu trúc**: người thường lọt vào group chat mà mọi người tự xưng 府主/洞主/真人/天师 — và họ **là tu sĩ thật**. Qidian liệt kê gag đặc trưng như **"怀孕凝视"** và thi lái **手扶拖拉机** của tu sĩ |

Công thức hài của lớp này:

```
thế giới tu tiên
  + stakes nghiêm túc
  + nhân vật ngu ngốc / hành vi absurd
  + hệ quả không lường trước
  = một cảnh tu tiên hài
```

##### Lớp C — shadiao-animation
**Không tải tiểu thuyết cho lớp này.** Lấy **video / episode metadata / transcript / creator
info**.

Thứ cần học ở đây là **cách một tiểu thuyết được nén thành scene và joke** — không phải
cultivation lore. Cần quyền truy cập; nếu không có, dùng §4.

```
corpus/
├── canonical/        # 凡人修仙传 · 仙逆 · 一念永恒 · 我欲封天 · 烂柯棋缘
├── comedy/           # 一念永恒 · 修真聊天群
└── shadiao-animation/  # metadata + transcript, KHÔNG phải văn bản tiểu thuyết
```

---

#### 7. Điều chưa biết, và không nên đoán

| | |
|---|---|
| Tần suất thật của từng thành phần trong format điển hình | **[CHƯA KIỂM]** |
| Pipeline render thật — hậu kỳ dùng gì, bao nhiêu giờ một tập, dùng AI hay không | **[CHƯA KIỂM]** |
| Quan hệ giữa một tập 3 phút và khối lượng thuyết truyện nó nén | **[CHƯA KIỂM]** |
| Độ dài chu kỳ của một arc — bao nhiêu tập một câu chuyện | **[CHƯA KIỂM]** |
| Nhịp joke — bao nhiêu giây một cú, và cảnh giới có chịu nổi không | **[CHƯA KIỂM]** |
| Cơ chế §2 có xuất hiện trong 沙雕动画 không, hay là đặc sảt riêng của 沙画 | **[CHƯA KIỂM — và đây là câu hỏi quan trọng nhất trong danh sách]** |

Câu cuối là câu tôi muốn biết nhất: **liệu *dựng → xoá → thay trạng thái* có phải là ngôn ngữ của
thể loại này không, hay chỉ là thứ tôi mang sang từ nhánh khác.** Nếu là thứ thứ hai, thì
Câu hỏi này vẫn đáng hỏi, và nó là câu tôi muốn biết nhất. Nếu câu trả lời là có, thì
research 沙画 vẫn đóng góp thật — tài liệu đã xoá, nhưng bằng chứng còn ở `TERMINOLOGY-沙雕.md`.

---

#### Nguồn

- Sự phân tầng ba nhánh: `TERMINOLOGY-沙雕.md`
- Bằng chứng còn lại từ nghiên cứu 沙画: `TERMINOLOGY-沙雕.md` §Nguồn
- Danh sách hệ sinh thái: hai video Bilibili đã nêu ở §4 **[CHƯA truy cập]**


---

# 4. Vực của thể loại

> Đợt 1 · 19 domain · 40 agent · 6M subagent token. 12 cụm từ được miễn phí, 41 hệ thống có trạng thái, 15 ràng buộc cứng, 20 thiết kế đừng copy, 9 khoảng mở.

**Ngày: 2026-09-30. Đợt 1: 19 domain, 40 agent, 6M subagent token. Mỗi domain có một skeptic
độc lập tấn công trước khi đi vào đây.**

> **Đọc `REFUTATIONS.md` trước tài liệu này.** Một danh sách các claim trong đây đã bị bác bỏ
> sau khi viết. Chỗ nào bị bác ghi **✗ ĐÃ SỬA** và dẫn về mục tương ứng.

---

#### Điều tài liệu này làm và không làm

Nó **liệt kê** vốn từ của thể loại: những từ người đọc tu tiên đã biết, nên dùng không mất
gì. Nó **không** kể một kịch bản. Những gì chưa ai làm nằm ở `OPEN-QUESTIONS.md`.

Ba nhãn, ép trên mọi cơ chế:

| Nhãn | Nghĩa | Hành động |
|---|---|---|
| **传承 GENRE_CANON** | Xuất hiện ở nhiều tiểu thuyết lẫn nhiều game, gốc từ truyền thống | **Mượn miễn phí** |
| **游戏原创 ONE_GAME** | Một studio hoặc một cuốn tiểu thuyết nghĩ ra | **Đừng copy** — đó là ý của họ |
| **PLATFORM_ARTEFACT** | Đẻ ra bởi cách kiếm tiền mobile | **Anti-pattern** cho game agent chơi |

#### Bốn bước ký hiệu nguồn

| Ký hiệu | Nghĩa là |
|---|---|
| `[G]` | Nguyên văn, primary text — truy ra được từ ctext.org / Wikisource / bản game |
| `[T]` | Văn bản chính thức của nhà phát triển: patch note, diễn đàn TapTap, trang chính thức |
| `[W]` | Wiki cộng đồng — thường là datamine, đôi khi là số học của fan |
| `[H]` | Trang hướng dẫn / content farm. **Xem `REFUTATIONS.md` §1.5 trước khi dùng.** |

Không có ký hiệu ⇒ **không có bằng chứng**. Số không mang ký hiệu đơn vị là **số không tồn tại**.

---


#### 1.1 Thang bậc và bức tường nó đụng

`境界` · `炼气` · `筑基` · `结丹` · `金丹` · `元婴` · `化神` · `炼虚` · `合体` · `大乘` ·
`渡劫` · `飞升` · `前期/中期/后期/圆满` · `瓶颈` · `心魔` · `天劫` · `走火入魔` · `顿悟` ·
`散仙` · `兵解` · `散仙劫`

**Cái ta được:** hiểu cột sống, trần, và bức tường, miễn phí.

**Cái ta phải tự viết:** đây **đồng thời** là cái scalar mà luật repo cấm. Nó **phải được
soạn như một tập cổng, mỗi cổng mua một năng lực có tên**:

| Cảnh giới | Mua được | Nguồn |
|---|---|---|
| 炼气 | 神识, 术法 | [G] |
| 筑基 | 辟谷, bay lâu | [G] |
| 结丹 | 本命法宝, bay không cần tiên | [G] |
| 元婴 | một cái tự thân tách rời | [G] |
| 化神 | hút linh khí môi trường, đổi bằng 寿元 | [G] |

**Danh sách năng lực là văn bản chính đã kiểm. Danh sách số thì không — và ta không cần nó.**

**✗ ĐÃ SỬA** — bản tổng hợp lập luận *"品阶 nằm trên vật, 境界 nằm trên người, nên thể loại
chưa bao giờ cần power number"*. **Đó là ngụy biện** — 境界 **có trật tự toàn phần trên người**,
vì đó là định nghĩa của một thang. Xem `REFUTATIONS.md` §1.6.

**Nhưng**: đây vẫn là cụm nền. Và xem `OPEN-QUESTIONS.md` §1 — **内丹 cho ta một cách viết
lại thang này thành mạch đồ thị, và cách đó là nguyên văn chứ không phải phát minh.**

#### 1.2 Bẩm sinh và phép thử

`灵根` · `测灵石` · `仙缘灯` · `天/地/玄/黄品级` · `变异灵根` · `伪灵根` · `杂灵根` ·
`五行相生相克` · `洗髓易筋` · `丹灵根`

**Cái ta được:** tính bất đối xứng, và **cảnh phép thử** — cảnh dễ đọc nhất trong thể loại.

**Và thể loại đã có câu trả lời của riêng nó trước khi scalar xuất hiện**: **五行相克 là
传承; con số là hàng nhập khẩu muộn.** [W]

**Cần chú ý**: danh sách trên đang nghiêng về game. Xem mục trước.

#### 1.3 Ba thân

`肉身` · `神魂` · `本命` · `泥丸宫` · `识海` · `精气神` · `三魂七魄` · `命魂` · `夺舍` ·
`元婴` · `分身` · `神识` · `性命双修`

**Đây là mô hình quyền lực không-cộng-thuật duy nhất thật sự trong thể loại, và là tiền lệ
cấu trúc mạnh nhất của ta.** [W]

- `觅长生` 的 生命/神识/遁速 phân kỳ trong dải **20×**, không theo một số [W]
- `斗破` chạy **một thang linh hồn riêng** (凡灵天帝), chỉ hội tụ lại ở đỉnh [G]
- `搜魂` là **vũ khí thông tin duy nhất** trong corpus — **trích xuất, không sát thương** [G]
- `泥丸宫` vs `识海` là vốn từ cho **một cái tâm là một nơi chốn**

**✗ ĐÃ SỬA** — "vì sao ba thân phân kỳ thay vì theo một số" được ghi là *"nobody has
published why"*. **Đã có câu trả lời, trong patch note của một studio khác**:
`修仙家族模拟器` patch 11.0.6 **tách rời** 炼体 và 常规境界 —
「常规突破不再要求炼体达到指定层级，炼体修炼和突破也不再受常规境界限制」. **Một studio
tách hai cái thang của họ ra vì ràng buộc chúng là vấn đề.** [T]

#### 1.4 Cuốn sách và kệ sách

`功法` · `心法` · `玉简` · `残卷` · `残本` · `藏经阁` · `拓印` · `品阶` · `师徒` · `口传心授` ·
`书非借`

**Cái ta được:** kinh tế tri thức, và **mô hình hiểu biết thân thiện agent nhất trong corpus**:

> `顿悟` **mở trong lúc hành động, đóng khi hành động kết thúc, và chỉ đọc được sau đó.**

⇒ Agent có thể **lên kế hoạch hành động nhưng không thể tối ưu một tỉ lệ.** Đây là hình
dạng đúng. **Chưa tác phẩm nào trả lời cách làm cho nó *lên kế hoạch được*.**

**Mỏ neo canon cho 残卷** — `凡人` chương 217 [G]:

> 「原本也不是九层，而是十三层才对…本门现在流传的青元剑诀只是残本而已！顶多能修炼到结丹期」

Văn bản gốc lưu hành là **chín trong mười ba tầng, có trần cứng**, và bốn tầng còn lại nằm sau
một cái ổ khóa hai chìa mà **chính mảnh văn bản** mở được.

⇒ **Cắt ngắn (TRUNCATION), không phải hạ cấp (DEMOTION).** Hạ cấp là chuyển từ phẩm cấp
sang sức mạnh — tức là scalar bằng một đường khác. Canon trả lời: cắt ngắn.

`藏经阁` chặn theo **cảnh giới của chính người đọc** — canon ở bốn tác phẩm không liên quan.

#### 1.5 Vật thể

`法宝` · `法器` · `灵宝` · `器灵` · `认主` · `滴血认主` · `禁制` · `符宝` · `真宝` ·
`本命法宝` · `炼器`

**Truyền thống vật thể không thang là thật, và cái thang là hàng nhập khẩu muộn**:

- `封神演义` **không có thang phẩm pháp bảo nào** [G]
- `斗破苍穹` xếp cấp **功法/斗技**, không phải 法宝 [G]

**符宝 là cơ chế duy nhất trong canon đổi quyền lực lấy THỜI GIAN thay vì lấy một bậc cao
hơn**: một phần mười 威能, chế tạo được từ 结丹+, dùng được bởi mọi tầng, **cạn khi dùng**,
và biến thiên trong chính lớp của nó. Phục hồi tốn **ba đến năm năm 元气 của chủ nhân** —
**không phải vài trăm năm**, đó là thứ các bản tóm tắt của fan nói. [G]

**Cảnh báo nguồn** — `天地玄黄` như một thang phẩm pháp bảo **không được trình bày là
truyền thống**: nó là một phản xạ dân gian hiện đại lặp trên hàng trăm trang hỏi đáp không
liên quan, không có tác giả xác định. Vật phẩm của chính `封神` là **玲珑宝塔, không có
tiền tố**.

#### 1.6 Nghề và nguyên liệu

`炼丹` · `灵草` · `灵药` · `年份` · `药龄` · `主药` · `辅药` · `药引` · `丹毒` · `丹方` ·
`丹纹` · `丹雷` · `阵法` · `聚灵阵`

**Đây là hệ thống duy nhất trong thể loại có cấu trúc ràng buộc liệt kê được thật sự, chứ
không phải một lần quay xúc xắc.** [W]

- `觅长生` có bộ luật được công bố: **số ô cố định, 平衡寒热, 144 viên đan trên 159
  nguyên liệu** — một không gian thỏa mãn ràng buộc mà máy suy luận được
- `鬼谷八荒` làm phần tử **không khớp hiện ra thành 杂质** và nâng rủi ro 炸炉

**Vật liệu chưa ai khai thác sâu nhất trong toàn bộ corpus — `抱朴子`**: phối hợp nguyên liệu
của tám tiên nhân **là một cái bẫy tường minh** (「药力有转相胜畏」), **không phải một
điểm cộng đồng minh**, và 合丹 giới hạn tội nhân ở ba người.

`年份` là trục chất lượng **thống trị, không phải tuyệt đối** — `觅长生` xếp theo 品级 thay
thế, với 药力 1/3/9/36/180/1080.

#### 1.7 Nơi chốn và mạch

`洞府` · `灵脉` · `灵眼` · `灵眼之物` · `灵田` · `药园` · `坊市` · `仙城` · `传送阵` ·
`洞天` · `福地` · `秘境` · `禁地` · `界壁` · `界面压制` · `散修`

**Sự thật mang tải của cả thể loại: cơ chế tập trung là một NƠI CHỐN, và linh khí được
canon nói là không cạn.** `凡人` chương 220 [G]:

> 「灵脉成形后便会自动散发出淡淡的灵气，让当地的灵气循环不绝，**不会有枯竭之日**」

**Lý do tồn tại của 坊市, phát hiện hay nhất đợt này**: **an toàn là một hàng hoá được mua**,
do thuế thương mại tài trợ, và **kết thúc ở biên giới.** [G]

`散修` sống được vì **mặt bằng của thế giới thấp hơn mọi 灵脉 một bậc** — phân biệt
theo kiểu nơi chốn, được nêu là ý đồ tác giả. [W]

**Vệ sinh thuật ngữ**: `秘境` là từ **thời game**, phủ lên `禁地`. Dùng **禁地** cho bất cứ
thứ gì mang tính diễn giải.

**Danh sách 118 nơi 洞天/福地 KHÔNG cố định** — ba bảng liệt kê mâu thuẫn nhau, và phần
`福地` của 杜光庭 có **71** mục. **Đừng kế thừa một danh sách.**

#### 1.8 Cơ quan

`宗门` · `杂役` · `外门` · `内门` · `真传` · `长老` · `峰主` · `首座` · `宗主` · `贡献点` ·
`客卿长老` · `俸禄` · `七脉` · `分舵` · `大比` · `论道` · `执事`

**Câu trả lời thật của thể loại cho "quyền lực không phải một con số" là MỘT CÁI THANG
THỨ HAI độc lập — không phải một sự phân rã của cái thứ nhất.** `藏经阁` chặn theo cảnh
giới của chính người đọc là ví dụ sạch nhất, canon ở bốn tác phẩm.

**Luật quản trị tương thích agent nhất tìm được ở bất cứ đâu**: `诛仙` — **hai tuần offline
thì hệ thống phế chức lãnh tụ, trao ghế cho phó đóng góp cao nhất, và yêu cầu họ đã đăng
nhập trong mười ngày.** [G]

**Điều cần nói thẳng**: danh sách mà một tông môn **HỨA** cho thành viên là văn xuôi canon
(một 洞府, không việc nhà, nguyên liệu hằng năm, một nghĩa vụ). **Danh sách nó THU KHÔNG
tồn tại ở bất cứ tác phẩm nào đã khảo sát.** Khoảng trống đó **là** thiết kế.

**Cảnh báo nguồn**: thang bốn bậc thành viên là **tổng hợp, không phải truyền thống** —
`诛仙` dùng 七脉, `迦南` dùng 外院/内院, `黄枫谷` dùng 执事/领事. **Dùng được; đừng trích là
kế thừa.**

`贡献点`: **từ là hàng nhập khẩu game; chức năng là canon** — `斗破` 的 迦南内院 chạy một sổ
火能 kiếm bằng 扫塔, săn 魔核, thắng đấu, tiêu ở 藏书阁 và tiền tháp, có trợ cấp hằng tháng.

#### 1.9 Tên và uy tín

`道号` · `法名` · `尊号` · `字辈` · `三山滴血字派` · `散仙` · `金仙` · `逐仙录` · `恶名` ·
`凶名` · `称号` · `好感度` · `声望`

**Nhận dạng và sức xã hội, KHÔNG có con số quyền lực nào trong đó** — cụm rẻ nhất và giá trị
cao nhất ta có.

**Tách ba thẩm quyền** (trích dẫn đã thất bại, nhưng sự tách tồn tại): 法名 từ sư phụ, 道号
tự chọn, 尊号 từ một thẩm quyền.

**`散仙` (không được phong, không có chức vụ) vs `金仙` (có chức vụ và có lương)** — một trục
**thực sự trực giao với tu luyện**, nguồn ở 韩愈 và 神仙传, **không phải từ game**. [G]

`字辈` là bài thơ dòng dõi phát ra như cổng đặt tên, và `诛仙` cho thấy **một thế hệ bị TIÊU
HỒ theo thứ tự** (普泓…普方, rồi 法相/法善/法中) — một dãy, không phải một nền văn hoá đồng
nhất.

**Bằng chứng lịch sử mạnh nhất cho việc danh hiệu mất sức phân biệt**: 明代 đặt tám chức
quan lập đầu, đến **成化二十三年** sổ đã ghi **một trăm ba mươi ba quan**, gấp **mười lăm
lần** ngạch ban đầu, với **ba trăm mấy** lần 传升 trong **hơn hai mươi năm** của một triều
đại. [G] ⇒ **Thứ cấp bởi thẩm quyền phải thu hồi được, và phải phai.**

#### 1.10 Trao đổi

`灵石` · `下品/中品/上品/极品` · `贡献点` · `坊市` · `拍卖行` · `黑市` · `以物易物` ·
`储物袋` · `户帖` · `验资`

**Hai trục phẩm cấp — cơ cấu trúc bảo vệ của thể loại trước một điểm tổng hợp**: 品阶 nằm
trên **vật thể**, 境界 nằm trên **con người**. Thang bốn bậc là canon, **kể cả 忘语**
(低阶/中阶/高阶/超阶, với một trục hệ ngang hàng).

**✗ ĐÃ SỬA** — xem `REFUTATIONS.md` §1.6: lập luận "nên thể loại không cần power number"
không đứng được. **Còn lại đúng**: thang bốn bậc là canon, và **đặt phẩm cấp lên vật là cơ
chế duy nhất đã có sẵn để giữ mọi thứ không còn trật tự toàn phần trên con người.**

**✗ ĐÃ SỬA** — bước 100:1 bị gọi "convention-free" trong khi danh sách ngay cùng câu ghi nó
được tài liệu hoá ở 100:1, 1000:1, 10:1 và ~5/5/6. **Đúng nhất: thang bốn bậc là canon; bước
là biến tự do.** `烟雨江湖` chạy bước **tuyến tính** (+70 mỗi bậc, +120 mỗi giai đoạn) —
**mười điểm dữ liệu trong một game. Lấy bước tuyến tính**; đó cũng là bước duy nhất agent
lên kế hoạch được. [W]

Bậc cao nhất **rời khỏi lưu thông** ở hai tác phẩm: 有价无市; 理论上可以兑换实践中已成为宝物.

**`储物袋` là mẫu cả lĩnh vực này nên sao chép**: nó **từ chối cứng** một lần nhét khi vượt
sức chứa hoặc vượt tỉ lệ thu nhỏ, **và không chứa được sinh vật sống**. Hệ thống từ chối,
**nên agent không phải nhớ gì cả.** [G]

**`户帖` là ranh giới hành chính có bằng chứng mạnh nhất trong corpus**: không 户帖 ⇒ 黑戶 và
sống ngoài tường; **100 灵石 ở cổng**; thừa kế từ một bên cha mẹ. [G]

#### 1.11 Kẻ thù và bạn đồng hành

`妖兽` · `妖丹` · `魔核` · `奇虫榜` · `灵兽` · `血契` · `魂契` · `反哺` · `驭灵师` · `兽潮` ·
`口吐人言`

**Phát hiện cấu trúc mạnh nhất lĩnh vực này: HAI KINH TẾ KÉO NGƯỢC CÙNG MỘT CƠ THỂ**,
và `反哺` là thứ thay thế cho việc thu hoạch. [G]

**`血契` vs `魂契` là cặp hợp đồng dễ đọc nhất cho agent trong toàn bộ corpus, vì nó **đã là
kiểm tra được bằng máy**: hợp đồng **rút lại được bất kỳ lúc nào**, thú **có thể tự rời đi**,
và `炼魂` **hủy nó**. Định nghĩa dùng được của `御兽诸天`: **thứ bạn kiểm soát là 灵兽,
thứ bạn không kiểm soát là 妖兽** — ranh giới là **quyền kiểm soát, không phải loài**. [W]

`奇虫榜` là artefact xếp hạng **không đáng tin** của chính thể loại: tiểu thuyết nói thẳng
danh sách có đáng tin hay không *"tùy ai"*.

#### 1.12 Đồng hồ

`一甲子` · `闭关` · `灵潮` · `天劫周期` · `寿元` · `元会运世` · `洞天封闭` · `秘境周期` ·
`时令` · `月相`

**Cảm giác về thời gian sâu** — và cuộc tranh luận của thể loại với chính đồng hồ của nó (nó
phàn nàn rằng 闭关 **nay chạy cả 一甲子**, và phàn nàn rằng trước đây ngắn hơn).

**Đây là cụm nguy hiểm nhất ta kế thừa.** Mọi đồng hồ trong corpus đều **đơn vị mà agent không
giữ được**.

**Vệ sinh nguồn**: `灵潮` **KHÔNG phải 传承** — chứng kiến cổ duy nhất (郭璞《江赋》) nói về
**thủy triều sông Dương**, không phải chu kỳ linh khí.

---


`CANON_FIXED` = vốn chung, dùng được · `ONE_GAME_ONLY` = của một studio · `MUST_INVENT` =
phải tự nghĩ · `SHOULD_CUT` = đừng xây

#### 2.1 Lõi tu luyện

| Hệ | Trạng thái | Câu hỏi mở | Bị chặn bởi |
|---|---|---|---|
| Thang 境界 và cổng năng lực từng bậc | CANON_FIXED | **Bậc nào của thang ta đặt hai người đối đầu nhau?** Nếu có, cả thiết kế là thứ luật repo cấm | Luật repo; và **cả hai** tử thôn đã ship đều phán bằng ngưỡng 战力 [W] |
| Hình dạng tầng nhỏ (前期/中期/后期/圆满 vs 层) | CANON_FIXED | Tầng nhỏ là một **TỐC ĐỘ** hay một **TRẠNG THÁI**? Tốc độ là thứ agent không tối ưu được | Không — số tầng là biến tự do, corpus chia cả hai [W] |
| 灵根 / 五行 | **MUST_INVENT** | Linh gốc có thể **CÓ KIỂU** (hệ nào, nó sẽ chạy kỹ thuật nào) thay vì **CÓ CẤP** (một số)? | Bài toán hai trật tự toàn phần: `凡人` chạy số lượng gốc và phẩm độ tinh khiết thành hai trật tự riêng, và hai trật tự cùng nhau xếp tất cả |
| Thang 功法 / 心法 | **MUST_INVENT** | Điều gì làm một cuốn sách **TỐT HƠN** mà không đính số? 忘语 nói thẳng 功法等阶 và 修为等阶 không phải một khái niệm [G] | Tiền lệ duy nhất là bốn chiều của `斗破` (质/量/吸收修炼速度/顺畅程度), không phải điểm sức mạnh [G] |
| Hiểu biết (顿悟) | **MUST_INVENT** | Làm sao để một cửa sổ mở trong hành động, đóng khi hành động kết thúc, chỉ đọc được sau đó, **trở thành kế hoạch được** cho agent? | Không — thuần thiết kế, và là mô hình hiểu biết **duy nhất** trong corpus không phải một tỉ lệ |
| 残卷 / văn bản dở | CANON_FIXED | Cắt ngắn hay hạ cấp? **Hạ cấp là scalar.** Canon trả lời: cắt ngắn | Không — `凡人` ch.217 [G] |
| Cổng 藏经阁 | CANON_FIXED | Cổng là **trạng thái của chính bạn** hay **thứ hạng giữa những người khác**? | Không — canon trả lời, bốn lần trong bốn tác phẩm không liên quan |
| 突破 | CANON_FIXED | Vòng lặp thử lại, hay bộ cộng dồn? Canon nói **bộ cộng dồn**: viên thứ bảy đưa dư lượng tới 接近饱和, viên thứ tám làm nổ | Không — `凡人` ch.216 [G] *(ràng buộc mang tính khuyến nghị trong chính văn bản)* |
| 天劫 | **MUST_INVENT** | Tử thôn **thử cái gì**, nếu không phải so sánh ngưỡng? | **Luật scalar, cứng.** Đây là cơ chế quan trọng nhất phải phát minh và là cái thể loại làm sai nhất quán nhất |
| 心魔 | CANON_FIXED | Quỷ gái đọc gì và phạt điều gì? 楞严经: 「若作圣解，即受群邪」 — nó phạt **SỰ DIỄN GIẢI** | **Bề mặt free-text** — rủi ro agent. Không game nào thay nó bằng một vị từ kiểm được |
| 寿元 | **SHOULD_CUT** | *(đã sửa)* | **Cắt như hạn chót; giữ như tài nguyên để mua hành động.** `云墟修仙录` bán **50000 灵石 cho 50 năm** — một *mua* tính bằng năm, không phải một *cổng* [W] |
| 走火入魔 | CANON_FIXED | Trạng thái agent phải **MÔ HÌNH**, hay thuế nó phải trả? | Không. Lưu ý `斗破` kích hoạt bằng chất ngoài và sống sót nhờ **sự hiện diện của nhân vật khác** — hình dạng phối hợp, đáng lấy |
| 夺舍 | **SHOULD_CUT** | *(không có câu hỏi đáng hỏi)* | So sánh quyền lực theo cấu trúc; một lần trong đời; quy tắc canon của chính nó khiến kẻ chiếm **thua vì đứng yên** |
| 轮回 / 转世 | **MUST_INVENT** | Thế giới ta mang ký ức qua cái chết không? **Ký ức = save file, và save file hóa tan tầng thất bại với agent** | Cổ web-novel **chủ yếu là GIỮ ký ức**, nên thế giới mất trí nhớ là **điều lệch**, không phải mặc định |
| 肉身 / 神魂 / 本命 | **MUST_INVENT** | Thân nào **SỞ HỮU** cái gì, và thân nào làm được điều mà thân khác không? | Không về cấu trúc. **Về cân bằng thì chưa studio nào công bố số** |

#### 2.2 Vật chất

| Hệ | Trạng thái | Câu hỏi mở | Bị chặn bởi |
|---|---|---|---|
| 灵脉 / 洞府 / 灵田 | CANON_FIXED | 洞府 là **năng lực mua được** hay **ô trên bản đồ**? Canon nói: bán kính quanh một đỉnh, giữ bằng một con dấu | Thang thuê nhà đã sửa: bước phẩm 2:1 mua bước thuê 10:1 — **cân bằng của một tác phẩm, không phải luật** |
| Chất lượng 灵草 | CANON_FIXED | Tuổi là trục chất lượng **duy nhất**? Nó thống trị, không tuyệt đối | Ràng buộc canon: ba dược của 筑基丹 được gọi là 天生自长 **vì tu sĩ không thể trồng chúng** |
| 炼丹 | **MUST_INVENT** | **Tối ưu ràng buộc trên bộ luật CÔNG BỐ**, hay một lần quay? Chỉ cái thứ nhất agent lên kế hoạch được | Không. **Đừng học công thức đóng từ hướng dẫn** — công thức được sao chép rộng nhất có nguồn từ ba trang mâu thuẫn nhau, hai trong đó có văn bản World of Warcraft dán giữa bài |
| 法宝 | CANON_FIXED | Vật phẩm mang một **LỜI TUYÊN** trên người mang (tập điều kiện, và trạng thái thế giới nó mở là phần thưởng) hay một gói chỉ số? | Không. `认主` là một giao dịch kiểm được bằng máy — **dựng như boolean hệ thống đánh giá**, không phải một lần quay agent nhìn |
| 符宝 | CANON_FIXED | *(không có câu hỏi)* | Dùng nguyên trạng: một phần mười 威能, chế tạo từ 结丹+, mọi tầng dùng được, cạn khi dùng, biến thiên trong lớp, phục hồi **3–5 năm 元c của chủ** |
| 储物袋 | CANON_FIXED | *(không có câu hỏi)* | **Sử dụng nguyên trạng** |
| 妖兽 / 妖丹 / 魔核 | CANON_FIXED | 妖丹 có phải là **động cơ tu luyện của chính con thú** không, để thu hoạch là **cắt cụt** chứ không phải thu thập? | Không. **Chưa game nào ship nó như một hệ thống** |
| 灵兽 / hợp đồng / 反哺 | CANON_FIXED | Chi phí mỗi con là gì, và đường vòng là gì? `御兽诸天` có câu trả lời đầy đủ | Không |
| 秘境 / 禁地 | CANON_FIXED | Cửa sổ là **ĐIỂM YẾU TẬP THỂ** hay **một lần khóa**? `凡人`: điểm yếu năm ngày trong phong ấn năm năm, mấy 结丹 phải hợp lực | **Lựa chọn thiết kế chính là toàn bộ điểm** |

#### 2.3 Xã hội

| Hệ | Trạng thái | Câu hỏi mở | Bị chặn bởi |
|---|---|---|---|
| 宗门 và thang thành viên | CANON_FIXED | Tông môn **HỨA** gì và **THU** gì? Danh sách hứa có trong văn xuôi; danh sách thu **không tồn tại ở đâu cả** | **Khoảng trống đó là thiết kế** |
| 贡献点 / sổ nội bộ | ONE_GAME_ONLY | Sổ có **một chiều** không? | **Không chuyển nhượng chỉ có một trang bách khoá tự sinh** và một tiểu thuyết chạy ngược lại — coi là chưa xác lập |
| 客卿长老 | ONE_GAME_ONLY | Hợp đồng trả bằng 灵石 hay bằng **QUYỀN TIẾP CẬN**? | Không — nhưng **một nửa dẫn chứng là fanfic** |
| 论道 / 大比 / 切磋 | CANON_FIXED | Có trọng tài bên thứ ba không, và trọng tài có thể tra thắng **do chấn thương** không? | Cả hai là **MỘT TÁC PHẨM**; bracket 同代-only và trần cùng cảnh giới đều dựa trên một chương của một tiểu thuyết web |
| 追杀令 | CANON_FIXED | Phần thưởng đi cho **kẻ giết** hay cho **người tố giác**? Canon nói người tố giác | **Bài toán đòn bẩy leo thang** — một lệnh giết mở + trả thưởng cao cộng với sự không tha thứ sau một phản bội của GPT-4 **là xoáy trả đũa mà tài liệu LLM dự đoán** |
| 道号 / 尊号 / 字辈 | CANON_FIXED | Thẩm quyền cấp là ai, cái tên tốn gì, và chuyện gì khi thẩm quyền cấp quá nhiều? | Không — **rẻ nhất, giá trị cao nhất, và không mang con số quyền lực nào** |
| 声望 / 好感度 / 恶名 | **SHOULD_CUT** | Theo người xem hay toàn cục? **Bản theo người xem** mới là cái thú vị, và có trong văn bản chương (炼气+1, 筑基+10, 结丹+100 **cho người đã giúp mình**) [G] | **Một dải có dấu toàn cục là scalar.** Và một agent rơi dưới ngưỡng có thể **không còn động từ nào trong game để sửa** |
| 灵石 / trao đổi | CANON_FIXED | Giá cố định, hay một sổ có độ sâu? Corpus mặc định là giá cố định, **và mặc định đó ĐÚNG cho agent** — agent không bao giờ hội tụ và hệ thống nhượng quá mức [W] | **Bước 100:1 là quy ước miễn phí** — tài liệu hoá ở 100:1, 1000:1, 10:1, ~5/5/6. Thang bốn bập là canon |
| 洞天 / 福地 | CANON_FIXED | Danh sách có liệt kê được không, và vào có được ghi không? **Không kế thừa một danh sách cố định** | Ba cách liệt kê mâu thuẫn nhau |
| 传送阵 / đi lại | CANON_FIXED | Nó là **biên**, **thuế**, hay **lời tuyên**? Corpus có cả ba | Con số 2,78× là phép tính của một tác giả trên một mảng — **không phải luật** |
| 界壁 / 界面压制 | CANON_FIXED | Sự chế ngự là **CỤC BỘ** hay **TOÀN CỤC**, và là luật hay bug? | **Bố cục bản đồ (một vùng cho một cảnh giới) là phần thêm của thời game**, không phải bản thân sự chế ngự |
| 战力 / bảng xếp hạng / matchmaking | **SHOULD_CUT** | *(không có câu hỏi)* | **Cắt.** Meta công bố của chính thể loại là bằng chứng: người chơi **tháo pet, bỏ PvP xếp hạng, và 洗去 神ông vừa học** để số hiển thị thấp xuống cho bracket [W] |
| 体力 / giới hạn lượt / 限购 / 绑定 / VIP / 月卡 / 签到 | **SHOULD_CUT** | *(không có câu hỏi)* | **Hạ tầng kiếm tiền, không phải thể loại.** Một đồng hồ agent không quan sát được là thất bại im lặng; một nhãn 绑定 làm nửa kinh tế **thua vĩnh viễn** với một agent không đọc patch note |
| 跑商 / 日常 / 挂机 / giới hạn thu thập | **SHOULD_CUT** | *(không có câu hỏi)* | Trần offline cứng biến toàn bộ kinh tế thành **bài toán đếm số lần đăng nhập** [W] |
| Cạn kiệt tài nguyên: mạch cạn, server bị lột | **SHOULD_CUT** | *(không có câu hỏi)* | **✗ ĐÃ SỬA — xem `REFUTATIONS.md` §1.8.** Đây là **lỗi phạm trù**, không phải lập luận. Câu canon nói về **灵脉** — một **tính chất nơi chốn** |

#### 2.4 Thế giới

| Hệ | Trạng thái | Câu hỏi mở | Bị chặn bởi |
|---|---|---|---|
| 灵潮 / 兽潮 / lịch thế giới | **MUST_INVENT** | Lịch **PHÁN XỮ** hay chỉ **THÔNG BÁO**? Nếu nó phán xử trên một ngưỡng, ta đã dựng lại scalar. Nếu là một đồng hồ chung mọi agent tự tính được **không cần nói với ai**, nó là nền phối hợp | Ba truyền thống gốc dùng **nhịp không tương thích**, nên **không có con số chung để kế thừa** |
| Nhiều phiên | **MUST_INVENT** | *(xem `OPEN-QUESTIONS.md` §5)* | **Không có một dữ liệu điểm nào** |

---


Mỗi cái được gắn nguồn. Đây là **tường chịu tải** của thiết kế.

1. **Không scalar nào được xếp hạng toàn bộ tu sĩ.** Khoảnh khắc con số tồn tại, matchmaking, quyền tiếp cận theo bậc, phần thưởng — và mọi hệ khác — trở thành hàm của nó. [`packages/features/progression/src/rules.ts:276-278`]
2. **Tử thôn không được phán bằng so sánh ngưỡng.** Cảnh kịch tính nhất của thể loại không được là một đồng xu trên một con số mà người chơi chỉ có thể bơm lên. **✗ ĐÃ SỬA — nguồn ban đầu bị trích sai, xem `REFUTATIONS.md` §1.1. Luật vẫn đúng; nguồn phải tìm lại.**
3. **Linh gốc hoặc cảnh giới không được trở thành thứ hạng tổng hợp.** Hai thang mà cả hai đều định nhận xếp tất cả còn tệ hơn một thang. [đã kiểm ở bốn tác phẩm]
4. **Không đồng hồ chân thực tính bằng năm được làm cổng.** [Nguyên văn thể loại chống lại chính nó: 「动不动就是一甲子」]
5. **Không cơ chế nào đòi thương lượng tự do giữa các agent, và không giá nào được phép mặc cả.**
6. **Không cơ chế nào phụ thuộc việc agent giữ trạng thái qua hàng nghìn lượt — và nghĩ lâu hơn không phải cách sửa.** **✗ ĐÃ SỬA — xem `REFUTATIONS.md` §1.4. Có phản chứng lý thuyết chống lại "LLM không bao giờ hội tụ".**
7. **Không vật thể chung nào được tạo ra một trạng thái vĩnh viễn từ một lần phản bội.**
8. **Mọi ràng buộc phải kiểm tra được bằng máy, không phải kể chuyện. Hệ thống nên TỪ CHỐI, không phán xử.**
9. **Hiểu biết không được mô hình hoá như một tỉ lệ.**
10. **残卷 phải CẮT NGẮN, không bao giờ HẠ CẤP.** [G]
11. **Cổng phải là hàm của trạng thái chính bạn, không bao giờ là thứ hạng giữa những người khác.**
12. **不可毁人丹田 phải là một điều cấm cứng có hậu quả kiểm được, xếp ngang 不可伤人性命.** [canon, hai tác phẩm độc lập thật sự]
13. **Bất cứ gì thẩm quyền cấp phải thu hồi được, và phải phai hoặc lấy lại được. Cấp hàng loạt giết chính bộ phân biệt.** [明代]
14. **Không được trình bày phản xạ dân gian hiện đại như truyền thống.**
15. **Tên và uy tín không được mang con số quyền lực.** [G]

---


| | Đừng làm | Vì sao |
|---|---|---|
| 1 | **战力** hiện ra, và mọi cổng nội dung/matchmaking/endgame khoá theo nó | Luật repo cấm; ít nhất sáu game đã ship vỡ vì nó. **Meta công bố của chính thể loại là bằng chứng**: người chơi tự loại pet và 神ông để số thấp xuống |
| 2 | Tử thôn phán bằng **so sánh ngưỡng** | Bản tổng hợp khẳng định đây là ví dụ thuần khiết của thất bại. **✗ ĐÃ SỬA — bằng chứng gốc sai, xem §1.1. Luật còn đúng** |
| 3 | 灵根 là scalar cá nhân xếp chồng với 修为 | Hai thang xếp tất cả buộc mọi hệ khác phải chọn một. `修仙家族模拟器` công bố: 旬速 và phần thưởng đột phá là **phần trăm của một thứ hạng** [W] |
| 4 | Cổng đột phá nhân bốn với **0,48%** đích danh, mọi build tinh chỉnh để chạm trên 100,00 | Đây là scalar có ba đầu vào, và các cổng là **mini-game phản xạ thời gian thực**. Cơ chế micromanagement nặng nhất lĩnh vực [W] |
| 5 | Thể lực, trần lượt, 限购, 绑定, VIP, 月卡, 签到, giới hạn thu thập | **Hạ tầng kiếm tiền, không phải thể loại.** `偷菜` là hàng nhập khẩu từ QQ农场 mà studio phải **đặt tên và nhập** — tức khán giả không biết trước [W] |
| 6 | 挂机 với trần offline cứng | Biến toàn bộ kinh tế thành **bài toán đếm số lần đăng nhập** — thứ một đàn agent không dạy được tối ưu |
| 7 | Kinh tế cạn kiệt: mạch cạn, server bị lột | **✗ ĐÃ SỬA — xem §1.8. Đây là lỗi phạm trù.** |
| 8 | Bất cứ đồng hồ tính bằng năm nào làm cổng | Không agent nào giữ được. Ba truyền thống gốc dùng nhịp tử thôn **không tương thích** |
| 9 | 夺舍 như một đường tiến trình | So sánh quyền lực theo cấu trúc; một lần trong đời; quy tắc canon của nó khiến kẻ chiếm thua vì đứng yên |
| 10 | Nghịch đảo 天灵根 五行合一, nơi đáy thang thắng cổng đỉnh không vượt | Truyền thống nói ngược lại: 「五行俱全突破到炼虚的几乎没有」 — **vì họ chậm**, không phải vì được lợi |
| 11 | **天地玄黄 như thang phẩm pháp bảo**, trình bày là truyền thống | Một phản xạ dân gian khối lượng trên hàng trăm trang không liên quan, **không tác giả**. `封神演义` không có thang này [G] |
| 12 | Lịch 秘境 mà chế độ thất bại là **hụt dừng đồng đội** | `剑网3` 的 同步秘境 tạo instance ID, nhắc party sync, và nếu ai từ chối hoặc khác ID thì **分别被传送入不同ID的秘境内** — party chia đôi **không có lỗi nào hiện ra** [W] |
| 13 | Một **心魔** dùng chung có khóa chéo người chơi | `诛仙`: 「当别人已经召唤出心魔时，你不能再召唤心魔」 — vật thể chung + khóa chéo + dân số vĩnh viễn [G]. **Đây đúng là cấu trúc sinh xoáy trả đũa** |
| 14 | Uy tín là một dải có dấu toàn cục, và ngưỡng uy tín chặn động từ cơ bản | `剑网3` hai dải thấp nhất đều ghi **主动攻击，不能对话、接任务** — hội thoại và nhận nhiệm vụ đóng đúng chỗ cần sửa [W] |
| 15 | Trần 散仙 viết bằng **战力 ≈ 渡劫中期** | **Scalar mặc áo**, nguồn từ hai số của tiểu thuyết mà chính nguồn gọi là không thể hoà giải. `散仙` làm từ vốn còn sống; **con số trần thì không** |
| 16 | Danh sách 117/118 nơi 洞天/福地, và phép tính sét 三九/四九/六九/九九 trình bày là canon | **Không có danh sách cố định ở đâu cả.** Quy ước sét là **số học tiểu thuyết web thế kỷ 20–21**, vắng trong mọi văn bản gốc, và có một định nghĩa ngược được chứng kiến |
| 17 | Công thức trích từ trang hướng dẫn | **Thất bại nguồn rõ nhất của đợt 1.** Một công thức chất lượng có nguồn từ ba hướng dẫn cho ba câu trả lời khác nhau, **hai trong đó có văn bản World of Warcraft dán giữa bài** |
| 18 | **灵石 vừa là tiền vừa là thuốc linh khí cấp cứu**, nghiền giữa trận | Không thể cấm scalar rồi để tiền là một vật phẩm quyền lực: trung bình chở **gấp mười linh khí**, nên gấp mười sinh tồn, và tiền tệ thôi là tiền tệ |
| 19 | Phân phổ phần thưởng theo **đóng góp cá nhân**, và chiêu binh với kết cục cứng | `凡人` 的 血色禁地 là 秘境 được tài liệu hoá nhiều nhất và văn bản của nó nói **cả hai điều**: thuốc chia 「按各派提供的靈药多少来按比例分配」 — **đòi mỗi người giữ một sổ cá nhân chính xác và tin vào nó** — và mười người thì chín có kẻ trốn đi chờ hết đồng hồ [G] |
| 20 | Danh sách đen toàn cục ai giết ai, cấp lệnh giết vĩnh viễn | Không phải vì cơ chế dở — nó canon và **nhắm người tố giác**, là bản tốt hơn — mà vì **bài toán đòn bẩy leo thang là toàn bộ rủi ro** |

---


Xếp theo **cơ hội**, không theo độ dời. Với mỗi slot: **vì sao thật sự chưa ai lấy**, và
những gì cần để lấy được.

##### 1. Cửa sổ điểm-yếu-tập-thể là nguyên thủy phối hợp **duy nhất** của thế giới
Một phong ấn chu kỳ năm năm với điểm yếu năm ngày, mấy tu sĩ phải hợp lực ép — là một
**đồng hồ chung cộng một vị từ đếm được.** Hai agent phối hợp bằng cách **đọc lịch**, không
phải bằng cách nói chuyện.
**Vì sao chưa ai:** **không phải vì chưa ai nghĩ** — thể loại viết cơ chế này liên tục. Nó là
vì một cửa sổ **có lợi cho tất cả mọi người thì thương mại trơ trượt**: người chơi người
không cảm thấy căng thẳng từ một đồng hồ ai cũng thấy.
**Cần:** biến cửa sổ thành **biến trạng thái thế giới được công bố**, và biến yêu cầu thành
**một ĐẾM agent đạt một vị từ trạng thái tại một thời điểm đã nói** — không phải một thoả ước,
không phải một tin nhắn, không phải thương lượng. Rồi đặt **mọi phần thưởng chung của thế giới
vào trong đó**.
**⚠ Hạ cấp** — xem `REFUTATIONS.md` §1.14: nó dựa trên một chương của một tác phẩm. Hoặc
tìm tác phẩm thứ hai và thứ ba, hoặc hạ xuống giả thuyết.

##### 2. Thăng tiên như một **lối ra một chiều**
Canon cấp 飞升 là một cuộc rời đi. Thế giới mà đỉnh là một **PHA** khác (một cõi, một chức
vụ, một tông môn) thay vì một số lớn hơn thì **không cần trần**, và vì thế **không cần
scalar để trông trộm**.
**Vì sao chưa ai:** **Thương mại, và không phải gần.** Mô hình doanh thu của một MMO đòi người
chơi đỉnh phải ở lại đỉnh và cái thang trên họ phải tiếp tục lên. Rời đi là một cánh cửa
một chiều không có chi tiêu quay lại.
**Cần:** một thế giới bền vững nơi thăng tiên **loại người chơi ra khỏi tầng có bảng xếp
hạng**, và **ghế trống là một sự thật thế giới bền vững** mà agent khác thừa kế.

##### 3. Phẩm cấp nơi chốn **định kiểu sức chứa**, không định kiểu quyền lực
Phẩm của một mạch đặt số người nó nuôi nổi, không đặt nó mạnh đến đâu. **Bước thuê đã sửa
2:1 mua bước 10:1** nghĩa là phẩm đang được **định giá như khan hiếm, không như quyền lực** —
đó là nước đi chống scalar của thể loại, đã dựng nửa.
**Vì sao chưa ai:** mọi hệ chiến đấu trong thể loại **muốn** một con số sức mạnh, và phẩm
sức chứa không sinh ra cái nào — nên ngà nào ai đó nối 灵脉 vào một trận, họ chuyển nó thành
phẩm quyền lực để làm chiến đấu đọc được. **✗ ĐÃ SỬA** — bằng chứng mà bản tổng hợp dựa
vào **chính là điều khoản tác giả đã loại**. Xem `REFUTATIONS.md` §1.10.
**Cần:** cam kết **không phân xử chiến đấu nào theo phẩm nơi chốn**. Một mạch là **một căn
phòng có số cửa**. Rồi câu hỏi thú vị trở thành: **ai được dùng cái cửa** — đó là bài toán
chính trị, không phải bài toán chỉ số.

##### 4. Chợ định giá **ĐỘ SÂU**, không định giá giá
Corpus đã tài liệu hoá chênh lệch giá niêm yết và giá thực thi. **Chưa ai xây một sổ lệnh
có độ sâu để đọc được thanh khoản** thay vì phải mặc cả.
**Vì sao chưa ai:** nó **xoá khoảnh khắc con người**. Chênh lệch là nhiễu với một người — bạn
chỉ việc đi sang sạp bên cạnh — và một cuộc mặc cả **là nội dung**, mà nội dung là lý do một
chợ tồn tại. Công bố độ sâu cũng khó bán: nó nói cho người chơi **chính xác lúc nào không nên bán**.
**⚠ Xem `REFUTATIONS.md` §2.8** — đề xuất bảng xếp hạng "điểm là một TẬP" của slot 4 là **ca
trôi trọng số đã được công bố**. Chỉ dùng được khi **trọng số công bố và cố định**.

##### 5. Nhịp bằng **mật độ hệ quả**, không bằng đồng hồ
Corpus có đúng hai câu trả lời về nhịp và **cả hai thất bại với một đàn agent**: một hạn chót
tuổi thọ không viên nào cửa vào, và server rotation. Câu thứ ba chưa ai lấy là **một lịch của
HỆ QUẢ** — những thứ xảy ra **vì agent đã làm gì**, trên một đồng hồ họ đọc được.
**Vì sao chưa ai:** nó phá **phép tính giữ chân** mà mọi dịch vụ trực tiếp xây trên.
**Cần:** công bố lịch, công bố vị từ đặt một agent lên lịch, và để **mật độ hệ quả trên mỗi
đơn vị thời gian agent** là nút nhịp.

##### 6. Vật phẩm là một **lời tuyên trên người mang**, cộng `符宝` đổi quyền lực lấy thời gian
Cho vật thể **điều kiện tiên quyết** thay vì hệ số nhân; phần thưởng là **trạng thái thế giới
mà vật thể mở**, không phải một chỉ số.
**Vì sao chưa ai:** **kiếm tiền**. Một vật phẩm-như-lời-tuyên **tệ hơn hẳn** một
vật phẩm-như-nâng-cấp khi bán, vì người mua **không thấy một con số đi lên** — và mọi game
này bán một con số đi lên. **✗ ĐÃ SỬA** — `完美世界` **đang bán nó**. Điều chưa ai lấy là
**phiên bản tốt**. **Cần:** **ĐỪNG thêm thang bậc về sau** — lịch sử của thể loại là cái thang
đến để **lấp chỗ trống**.

##### 7. Mô hình hiểu biết không có tỉ lệ, cộng một **sổ ghi hậu**
Giữ cửa sổ, thêm sổ, và để **sổ** — không phải tỉ lệ — là thứ **lãi kép**.
**Vì sao chưa ai:** nó **không kiếm tiền được và không cân bằng được**. Không thể tinh chỉnh
một cửa sổ mà không nhìn thấy nó, và không thể bán một ký ức.
**Cần:** chi phí của một lần thử là **như nhau mọi lần**; thứ cải thiện là **mô hình của agent
về hành động đó**.

##### 8. Cống hiến đo bằng **sự giúp đỡ người khác**, với quyền hạn là vật thể
Một thành viên giữ quyền **đặt khẩu hằng ngày cho từng người** — quyền lực là một thứ bạn
**có hoặc không có**, kiểm tra bằng máy. Cộng với quy tắc tự động tướng ghế, ta có một **mô hình
quản trị hoàn chỉnh không cần thương lượng và không cần tin**.
**Vì sao chưa ai:** **hướng thương mại sai**. Điểm đóng góp đo sự giúp đỡ **chậm**, và toàn bộ
kinh tế thể loại chạy ngược lại: một điểm xếp bạn với người ngang hàng — mà mọi bảng xếp hạng
đều cần và **đó chính là scalar** luật repo cấm.

##### 9. **Đỉnh của bảng xếp hạng là một gánh nặng**
Hai tác phẩm nói thẳng trong văn bản chính và cả hai đều **không tổng quát hoá**: một thân
mà toàn ra đầy hoàn hảo thì **quá hoàn hảo để thế giới cho phép**, và kỹ thuật mạnh nhất
tiến bộ bằng cách **tiêu vật thể thế giới có xếp hạng**, thành công **tám lần trên tám**.
**Vì sao chưa ai:** nó phá **đường cong phần thưởng** mà cả giữ chân lẫn mở rộng đều giả định.
**Cần:** để cái giá rơi vào **một loại tiền tệ khác với phần thưởng** — thời gian, tính toàn
vẹn của một thân khác, một lời tuyên người khác thừa kế — để đỉnh thang là một **quyết
định**, không phải một điểm đến.

---


Đợt 1, 2026-09-30: `realms` `aptitude` `currency` `gather` `alchemy` `artifacts` `tribulation`
`sects` `manuals` `titles` `beasts` `secretrealms` `worldmap` `death` `clock` `market`
`social` `body` `gaps` — mỗi domain một researcher, một skeptic, `effort: high`.

**Bắt buộc đọc kèm**: `REFUTATIONS.md` (hai đợt, phần bị bác), `RPG-SUBSTRATE.md` (đợt 2),
`OPEN-QUESTIONS.md` (còn gì chưa biết và đo bằng cách nào).


---

# 5. Chất nền RPG

> Đợt 2 · 18 domain · 36 agent · 5,2M subagent token. Cây vật phẩm, 16 mô hình cấp độ, 20 chỉ số, 25 quy ước phổ quát.

**Ngày: 2026-09-30. Đợt 2: 18 domain, 36 agent, 5,2M subagent token. Nghiêng về GAME ĐÃ SHIP
hơn tiểu thuyết — một tiểu thuyết nói "luyện đan ba năm", một game nói cái đó nghĩa là gì
trong lượt và trong tài nguyên.**

> **Đọc `REFUTATIONS.md` trước tài liệu này.** Đợt 2 bị critic bác bỏ **chiến đấu vắng mặt
> hoàn toàn**, và đó là lỗ hổng lớn nhất. Xem `REFUTATIONS.md` §2.1–2.4.

---

#### Câu trả lời một dòng

> Thể loại này phát minh đúng một thứ — không phải chỉ số, không phải thang, không phải màu:
> **một cảnh giới lớn phải mua cho bạn QUYỀN ĐƯỢC LÀM** (bậc 功法 cao hơn, thêm một ô kỹ
> thuật, thêm một trận pháp) chứ không phải một con số lớn hơn. **Đúng một game đã thử**, và
> ngày nào designer cộng lại con số, cái thang trở thành đồ trang trí.

Đó là `觅长生`: 境界提升 **chỉ** thêm 血量/神识/遁速/寿元/悟道点 — **không có nhân sát thương
nào cả**. Món thật là **trần bậc 功法** và **thêm một ô 功法**. [W]

**Và nó không phải game top-20, vì ba lý do cụ thể:**

1. Ảnh chụp marketing tệ hơn — **một ảnh chụp là một con số**.
2. Bảng xếp hạng toàn cục trở thành **bất khả thi** — và bảng xếp hạng là bề mặt giữ chân.
3. Ngày nào đối thủ ship nhân sát thương, người chơi được bảo rằng game mình **tệ hơn** —
   điều đó đúng, và **chính là cái giá**.

> **⚠ Cái giá nằm ở đâu chưa ai trả.** Mục openDesignSpace thừa nhận: *"if nothing scales,
> encounters must scale, and the encounter table becomes the whole game."* **Bảng encounter
> không có trong tài liệu này.** Không một chỉ số chiến đấu nào trong `statModel`. Đây là lỗ
> hổng lớn nhất của đợt 2 — xem `REFUTATIONS.md` §2.1, và xem `OPEN-QUESTIONS.md` §1.

---


Mỗi cụm: **phân loại**, và **cơ hội của ta**. Cơ hội trống nghĩa là chưa ai lấy.

#### 1.1 装备 — trang bị mang trên người

`武器` `护体` `鞋/饰` `品质/品阶` `+N 强化` `镶嵌` `套装`

**GENRE_CANON. Cơ hội:** bỏ thang phẩm thứ tự; giá trị của vật phẩm là **hàm của cái nó nói
chuyện tới**, không phải màu của nó.

**Hai sửa chữa các skeptic bắt buộc:**

- **`了不起的修仙模拟器` CÓ thang số.** Từ điển wiki định nghĩa 品阶 là cấp vật phẩm đại diện
  độ hiếm, trang 炼器 nói 品阶 đặt sàn và trần chỉ số, với **12 bậc + 0–100 品质**. Claim
  *"ACS không có bậc số"* đến từ việc **đọc một trang wiki LIỆT KÊ có bảng không có cột 品阶
  và suy ra từ cột thiếu rằng thuộc tính không tồn tại** — và **ba artefact dẻ xuống được
  dựng trên suy luận đó.**
- **Bộ set có trần KHÔNG phải sáng tạo của một studio.** `剑网3` 的 定国套 4pc =
  **+10% công nền tảng**; 逆水寒 desktop 的 紫装 = **+15% nội công/ngoại công nền tảng**;
  一起来修仙 trần né 25% / chí mạng 50% / đỡ 50%. **Chặn-bằng-chuyển-đổi là mặc định thể loại,
  và cái trần mới là thứ đáng lấy chứ không phải thứ đáng thoát.**

#### 1.2 法宝 / 飞剑

`认主` `剑灵` `剑意` `本命`

**Danh từ GENRE_CANON, mọi hiện thực là ONE_GAME.**

**Cơ hội:** `认主` **đã ship và gần như miễn phí về từ vựng** — `神仙道` có hệ 本命飞剑 đầy
đủ (sáu thanh kiếm có tên, sáu ô 剑意, mỗi ô một loại, **mất 神ông kép khi tháo**), và
`以仙之名` có thanh 法obao tám ô với 本命飞剑 nổi bên cạnh nhân vật.

**Cái không game nào nào hiện thực là HỆ QUẢ canon của tiểu thuyết: hủy vũ khí đã 认主 thì
chính bạn bị thương.** Đó là **vật thể nợ sạch nhất có sẵn trong thể loại**, và nó rẻ để xây
vì nửa 认主 đã tồn tại ở nơi khác.

#### 1.3 丹药 — vật thể tiêu hao

`一品-九品` `突破丹` `疗伤/解毒/洗髓` `药性` `丹方`

**Cơ hội:** làm viên thuốc là **vật thể tri thức agent dựng lại**, không phải hàng mua.

`觅长生` chứng minh điều này vừa ship vừa đọc được [W]:

> 「丹方不是必须的。它只是提供一个标准配方…只要你能知晓药力需求，就能炼出相应的药物」

Ba dấu hiệu quan sát được: **thời gian trôi qua**, **主药辅药药性**, **药渣** — và cửa sổ
chế tạo 3–8 ngày là **DẤU HIỆU phẩm cấp, không phải ổ khóa**.

**Đính chính định lượng**: *"mọi game khảo sát chặn tiến trình bằng một viên thuốc có tên"*
là **4 game trên 12** — là xu hướng đa số, không phải phổ quát.

#### 1.4 丹材 / nguyên liệu

`药力 ladder` `药引` `采药 cap`

**Bảng nguyên liệu chế tạo tốt nhất trong toàn bộ corpus và KHÔNG AI dùng:** thang dược của
`觅长生` có **药力 tăng 3–4× mỗi phẩm trong khi giá tăng 4–11× mỗi phẩm**, và **cửa sổ
kinh doanh chênh lệch được in sẵn trong nguồn** — 灵药堂 mua 三品启灵丹 dưới 6.000 灵石,
告示栏 trả 9.500.

⇒ **Đòn cần tinh chỉnh là CHÊNH LỆCH giữa tốc độ 药力 và tốc độ giá.** Tinh chỉnh độ chênh đó
và **toàn bộ kinh tế chế tạo tinh chỉnh theo**, không cần nội dung mới.

#### 1.5 功法 / 神通

`品阶 × 重数` `五层` `残页`

**Cơ hội:** làm một kỹ thuật là **một quyền**, không phải một hệ số nhân.

Vòng lặp **拆解-and-reroute** của chính `诛仙手游` là **một studio thừa nhận cái thang của nó
không có trí nhớ** — lý do được nêu: 36 天书 đã max sẽ tốn một gia tài, nên bạn giữ sàn của mỗi
cái và hoán đổi. **Đó là một lỗ hổng mặc bộ đồ.**

Và hướng dẫn của `修真界` tự thừa nhận cái thang **tự vô hiệu hoá khi cảnh giới tăng**:
「上一境界的功法即使品阶和重数再高，到了下一境界也不过相当于黄阶、玄阶一重左右」.
**Bằng chứng ship rõ nhất rằng một thang kỹ thuật số là rác ngay khi bậc thang nhích.**

#### 1.6 符箓 — giấy và bùa

`符纸 by tier` `手绘 blanks` `真伪 forgery` `熟练度 0-1000`

**Cặp canon + cơ chế có bằng chứng tốt nhất trong corpus**: `修仙家族模拟器2` nói thẳng đường
vòng (「使用符箓并不需要灵根条件」) — **giấy là câu trả lời của chính thể loại cho một chỉ số bẩm
sinh có cổng đóng.**

Quy tắc bịa mà đáng lấy, của `了不起的修仙模拟器`: một khuôn **đã học nhưng chỉ nhớ** cho ra
**60% 伪造** không mang cùng bản chính; một tờ trắng vẽ tay **luôn 品質 50**, **không có 真伪**,
và mang được cùng bất cứ thứ gì.

**Điều thật sự chưa ai lấy hẹp hơn mọi người nghĩ**: không game nào xếp cấp một lần **VẼ** một
cách tất định từ trạng thái đã cam kết. Công thức của `修仙家族` tất định, nhưng **không có
trạng thái phân giải nào**.

**Và một hiện thực thứ tư không ai thấy** (critic thêm): `修仙家族模拟器2` định nghĩa 符 là
「记录了一次技能的道具」 — **một bản ghi của một lần thi triển đã qua**. 品质 là **sự thật
lịch sử về một hành vi đã hoàn thành**, không phải một lần quay. Câu hỏi thiết kế trở thành
**"lần thi của bạn tốt đến đâu"**, không phải "lần quay của bạn tốt đến đâu". **Với agent, đây
là cái thú vị nhất trong bốn.**

#### 1.7 阵法 / 阵旗 / 阵眼

`阵枢` `阵眼` `阵旗` `阵法相克` `破阵` `变阵`

**Cơ hội:** công bố ngân sách trận pháp như **BA CON SỐ đánh nhau**. `ACS` làm đúng điều đó
trên 阵图 (稳定/规模/负荷) và đó là **cấu trúc non-scalar tốt nhất lĩnh vực** — nhưng **bản đồ
trận của cùng game là 越大越好, không trần và miễn phí**. **Căng thẳng thuộc về một hệ thống và
không được tổng quát hoá ra studio.**

**Hai đính chính phân loại mà skeptic bắt buộc:**

- Luật "阵枢 là kẻ tấn công duy nhất" là **ACS một mình**, không phải thể loại.
- `阵法相克` như một giải đấu đều đặn là **梦幻西游 một mình** — và chỉ đều **trên chín đỉnh**
  (tám cái có tên + 普通阵). **✗ ĐÃ SỬA** — mức out-degree là **3,4,3,4,3,4,3,4**, tức
  **KHÔNG đều**, tức **không mảng nào đứng ngang nhau**. Bản tổng hợp phát biểu tính chất rồi
  bác bỏ nó trong cùng một câu rồi dựng kết luận ngược lên đó. Xem `REFUTATIONS.md` §2.6.

**Cấu trúc không-so-sánh-duy-nhất được thiết kế đúng trong lĩnh vực**: ba bậc
**无克制 / 小克 3% / 大克 6%** của client mobile — mà một report gọi nhầm là xung đột đơn vị
thay vì đọc ra một cấu trúc.

#### 1.8 丹炉 / dụng cụ

`耐久` `灵力 pool` `炸炉` `控火`

**Câu trả lời anti-grind tốt nhất trong thể loại và không ai sao chép**: lò của `觅长生` —
**−1% hao mòn cho phẩm thấp, −2% ở phẩm khớp, −40% vượt một phẩm, −80% vượt hai phẩm,
炸炉 vượt nữa** — và kỹ năng 丹道控火 **xoá hao mòn HOÀN TOÀN**:
「做到一个六品丹炉用上一辈子」.

**Một đường bảo trì mà một kỹ năng thu hồi, thay vì một grind rút cạn.**

**Đừng tuyên bố vòng lặp thất bại đóng là phát minh**: `诛仙手游` **đã ship nó** — chuyển
dư đan thành 丹砂/药晶 và cho một **sản phẩm thất bại bán được**.

#### 1.9 Tiền và sổ sách

`灵石` `战力 composite` `绑定 vs 自由`

**Cơ hội — tiền lệ cho một sổ KHÔNG tổng hợp đã ship và corpus đi ngang qua**: bảng
鉴源估值榜 của `百世修仙` 「只认单件真实鉴源物品的最高估值」 và **loại trừ tường minh**:
「总资产、背包里多件物品相加、直售到账、挂牌报价、谈判费用、截杀奖励和撤离损失」.

⇒ **Một bảng xếp hạng mà mục vào là vật phẩm tốt nhất của bạn và từ chối cộng túi của bạn.**

Chưa ai đưa thêm vì **CÁI CỘNG chính là móc kiếm tiền**. Bảng xếp hạng anh hùng trong cùng game
làm **điều ngược lại** — điểm thô của nó tích hợp 战力 cùng 境界, 阶段, 历练事件, 剩余寿元 và
鉴源表现. **Studio đã ship cả hai. Ta chọn cái nào là việc của ta.**

#### 1.10 洞府 / 洞天

`耐久 100` `raid -30` `offline +1/h` `8-hour immunity`

**Cơ hội:** loại trừ dễ đọc nhất trong corpus — 100 耐久, **−30 mỗi lần cướp**, **+1/giờ**,
**miễn nhiễm 8 giờ sau cướp**, chiếm khi về 0, và 洞府灵气 hỏng dưới 80.

**Tự gây ra, đọc được, không phải số, và trả lời được bởi một agent khác** — trái ngược hoàn toàn
với lò đung đưa dùng chung của `诛仙手游`, cửa sổ đặt là **10 phút thực** — không đủ lâu để
tìm bốn người chơi cùng.

#### 1.11 Vật thể dựng từ chất — nguyên liệu, bùa, trận, lò, túi

`丹药` `符箓` `阵盘` `储物袋` `玉简` `任务物品`

`储物袋` — **hệ thống từ chối cứng, không chứa sinh vật sống**: agent không phải nhớ gì.

---


Xếp theo: **thoát scalar** hay không.

| Mô hình | Ai dùng | Cái giá | Thoát scalar |
|---|---|---|:-:|
| **Một scalar sức mạnh** — 战力/妖力/实力/总评 | **Mọi game mobile trong khảo sát**, và một PC sim. `一念逍遥` `寻道大千` `逆水寒` `天天炫斗` `修仙掌门模拟器` `了不起的修仙模拟器` | **Nó thậm chí không phải một hàm ổn định của nhân vật.** `一念逍遥`: 基础法攻 là hỗn hợp trọng số của bốn hướng, trang bị cộng thêm 27,2%, 战力 tổng hợp bảy hệ thống con **trong đó bốn là trang bị**. Chính thể loại khuyên phớt lời nó | ✗ |
| **Thang 境界 kèm chế ngự chéo cảnh giới** | Mọi người, nhưng **tên không chia sẻ**: 鬼谷八荒 炼气 筑基 结晶 金丹 具灵 元婴 化神 悟道 羽化 登仙; 寻道大千 炼气 炼虚 合体 大乘 真仙 天仙 玄仙; 完美世界手游 **mười tám cảnh giới, không có cái nào trong 炼气/筑基/金丹/元婴/化神** | **境界压制 CHÍNH LÀ scalar mặc áo.** `修仙家族模拟器2` công bố hệ số: cách nhau một cảnh giới = một nửa sát thương, hai = 30%, ba = 10% | ✗ |
| **Thang tầng nhỏ (层/小境界)** | 修仙家族模拟器2 10 tầng; 一念逍遥 10 tầng ở 炼气 rồi 4 khúc; 鬼谷八荒 10 cảnh giới × 3 = **ba mươi bước**; 觅长生 ba | **Đều là một con số đi lên.** Lỗi đắt nhất trong corpus: đọc 鬼谷八荒 là "mười cảnh giới rời rạc, không tầng nhỏ, không thanh XP" — **tiền lệ chống cấp độ nổi tiếng nhất** — trong khi bản ship là **một thang ba mươi bước mặc áo cảnh giới** | ✗ |
| **修为 là thanh, gộp lên chính tài nguyên** | 一念逍遥 là trường hợp tệ nhất: **修为 IS 真元 cho 法修, 气血 cho 体修** | **Không có gì trong game nâng tu vi mà không nâng quyền lực.** Nó cũng sinh ra trường đơn vị tệ nhất của corpus: tỉ lệ nhận của 觅长生 được công bố **không có đơn vị thời gian** trên **cả hai** trang wiki, và report vẫn gắn 修为-per-tháng | ✗ |
| **寿元 như đồng hồ lượt chạy** | Canon xuyên suốt tiểu thuyết | Nó là một đồng hồ nên agent lên kế hoạch được, và nó **tiêu được** nên tiêu nó là một quyết định. **Nó không đo gì về ai mạnh** | **✓** |
| **Đức hạnh theo cảnh giới, RESET mỗi lần thăng** (道心) | **修仙家族模拟器2 một mình** — và nó là **nguyên thủy anti-grind mạnh nhất tìm được ở bất cứ đâu** | Nó biến một phép kiểm phản xạ thành một lần qua chắc chắn. **Được nâng bằng sự kiện trong cảnh giới**, và ở 100 các hình 神识关 「完全透明」 và cổng tự qua | **✓** |
| **QUYỀN — cảnh giới mua được điều bạn được phép thử** | **Đúng một game: 觅长生** | Nó làm ảnh chụp marketing tệ hơn, và làm bảng xếp hạng toàn cục bất khả thi. **Cả hai chính là sản phẩm** | **✓** |
| **Đường cong không đơn điệu** | 太吾绘卷, trình bày như **độ trung thực mô phỏng, không phải thiết kế**: 膂力/体质/灵敏 giảm theo tuổi, 定力 tăng, 根骨 và 悟性 giảm ở tuổi trung và **tăng ở tuổi thơ lẫn tuổi già** | Vẫn là một con số đi đâu đó, và game **không bao giờ công bố đường cong**, nên người chơi không thể lên kế hoạch cả đời. **Nửa đọc được của ý tưởng là dải thừa kế THU HẸP khi trung bình cha mẹ tăng** (≥100 → 95–110%, xuống <40 → 65–140%) — mà không ai trích | ✗ |
| **Khả năng đọc theo không gian** | 修仙门派2 chặn 兽潮 12–18 năm trên việc giữ 10 ô đất rồi chờ thêm năm năm; 一念逍遥 的 破阵 xoá một tông môn khỏi bản đồ; ACS 诛仙剑阵 cần bốn tòa nhà 剑门, 周天星斗阵 cần 36 | **Không cái nào xếp hạng tu sĩ**, và tất cả đều là trạng thái agent đọc, lên kế hoạch và tranh chấp được. *(Đính chính: "4 cổng và 365 lá cờ là cùng đại lượng" là sai — chúng là **nhà cửa, vật phẩm và thành viên** — nhưng khả năng đọc thì có thật, và đây là cái thoát rẻ nhất trong corpus)* | **✓** |
| **Điều kiện hiện trạng** — kỹ thuật mở theo thế giới **lúc này** | **鬼谷八荒, đã ship**: 神火核 chỉ bắn khi **đang đứng trên một nút 火种**; 冰天眼 cần debuff băng **còn sống trên mục tiêu tại thời điểm chết**; 极风暴 cần hạ trong 300 đơn vị. Và `一念逍遥` 的 破阵 **không có thanh HP** | **Không gì cả.** Đây là cơ chế mà hơn mười report đã độc lập gọi là chưa ship **trong khi 鬼谷八荒 nằm ngay trong danh sách khảo sát của chính họ** | **✓** |
| **Xếp hạng theo nhóm tuổi** — bậc của bạn là bracket, và bracket là cục bộ | **梦幻西游** 的 精锐/勇武/神威/天科/天启/天元, **ship như một hệ thống hai mươi năm**: ở 69/89 phải hoàn thành nhiệm vụ đột phá để rời đi, và **kinh nghiệm tụt khi vượt 10× yêu cầu cấp**. 大话西游手游 chạy 停级服 chính thức | Nó trần mọi người **cùng nhau**, đó là cái giá giữ chân, và cần bảo trì bracket mỗi patch. **Nhưng nó là câu trả lời của chính thể loại cho bài toán trần** | **✓** |
| **Biên nhận** — xếp hạng trên một vật thể chứ không phải trên một nhân vật | **百世修仙** 的 鉴源估值榜: ghi giá trị **vật phẩm tốt nhất**, từ chối cộng túi, từ chối đếm 总资产 | Nó không diễn tả được sự giàu có — **đó chính là lý do nó không thể bị lợi dụng thành power score**, và cũng là lý do nó **không bán được một nâng cấp** | **✓** |
| **Thuộc tính có trần** — trần chuyển đổi, không cộng dồn | **寻道大千**: 闪避/击晕/反击 trần 80% dù thừa bao nhiêu; 连击/暴击/吸血 cần thừa 100% mới hết; 连击 trần 5 đòn; chí mạng phẳng 200% sát thương thường | Thuộc tính có trần **ngừng quan trọng quá mức trần**, nên câu hỏi build chuyển từ "bao nhiêu" sang "trần nào bạn đã tiêu". **Thành ngữ của chính thể loại, và là thứ ít dùng nhất trong đó** | **✓** |
| **Ngân sách để tiêu, không phải thanh để đổ** | 觅长生 的 悟道点: phân bổ có trần cứng (83 điểm ở 元婴后期, 98–108 ở 化神后期) trên 12 大道; hướng dẫn build coi việc định tuyến là **toàn bộ game** | Nó vẫn là một số đi lên, nhưng quyết định nó tài trợ là **topological chứ không phải volumetric** — cùng tổng cho ra những nhân vật khác nhau. **Một thoát thật, nhưng yếu hơn quyền** | ✗ |
| **Đồng hồ — một thế giới có ngày tháng** | 太吾绘卷; lịch có 38 và 76 lần bị che đã kiểm nguyên văn với log phát triển của studio | *(Đính chính: việc che là chống tiết lộ, không phải thế giới học — và chính studio nói 「为了避免剧透，只好委屈大家看这宛如残页般的年表」; claim "kỷ nguyên của game là im lặng sau năm ghi cuối" bị nguồn phủ nhận. Một đồng hồ cũng là mô hình cấp độ duy nhất mà một agent đến muộn không nhìn thấy)* | ✗ |
| **Bộ đếm thuộc tính không bao giờ tụt** | Phân tích cộng đồng của chính 一念逍遥 | Nó **nghe như** cách sửa lạm phát số và **là ngược lại**: một tỉ lệ không bao giờ tụt là **scalar vĩnh viễn bạn không thể vượt**. Cái thật là **chỉ số quyết định là vĩnh viễn**, không phải "đã bị trần" — và các report đọc nó là cái sau | ✗ |

---


| Chỉ số | Nghĩa | Rủi ro scalar | Ghi chú |
|---|---|:-:|---|
| **战力 / 妖力 / 实力 / 总评** | Tổng hợp toàn bộ bảng chỉ số thành một số xếp hạng | **✓** | **Không phải artefact kiếm tiền mobile**, dù bốn report nói vậy — nó là **quy ước MMO hai mươi năm, có trước F2P vài chục năm** (传奇, 梦幻西游, mọi JRPG Nhật). Cách nói đúng mạnh hơn cách sai |
| **境界** | Cảnh giới tu luyện chính | **✓** | Scalar mặc áo, và 境界压制 là bảng hệ số đã công bố. `寻道大千` 的 妖力 là phản ví dụ trung thực: một hiển thị bảng xếp hạng cộng một tiền tệ quy đổi, **chứng minh KHÔNG phải cổng chiến đấu** |
| **修为 / 灵力 / 真元 / 气血** | Tu vi tích luỹ; ở 一念逍遥 **CHÍNH LÀ** tài nguyên | **✓** | Trường hợp tệ nhất: không cách nào nâng tu vi mà không nâng quyền lực. `觅长生` sạch hơn — một thanh riêng với ngưỡng riêng và **trần cứng ở 炼气后期, nơi thanh đơn giản là dừng** |
| **资质** | Thiên phú bẩm sinh, nhân tốc độ tu luyện tuyến tính | **✓** | **+1% mỗi điểm, tuyến tính tới 200**, nên 100 = ×2 và 200 = ×3 (đối chiếu bảng thô của wiki). 天灵根 = 资质 ≥80 = tốc ×1,80 |
| **悟性** | Hiểu biết; ở 觅长生 là đường cong nửa sau 100, trần tiết kiệm 75% | ✗ | **Cái thoát thật nhưng nửa vời, và đã bị nói quá**: 0悟性 = 3160 ngày, 200悟性 = 790 ngày, **đúng 75%** — nhưng 感悟思绪 gần như không nhích (6,063 → 9,374, ~55%) trong khi thời gian đọc thì cắt một nửa |
| **领悟思绪** | Thiên phú thứ ba mà **game tường minh không gộp** vào hai cái kia | ✗ | Wiki ghi thuật toán **「并不遵循上述的算法」**. **Ba thiên phú, ba hình dạng, một hệ** — bằng chứng ship mạnh nhất chống một đường cong lợi nhuận đơn |
| **灵根** | Ở 觅长生: **trọng số lại bộ bài rút**, không phải scalar | ✗ | 伪灵根 = 20% mỗi hệ; 天灵根-金 = 33,33% Kim, 16,67% mỗi hệ khác. **Đó là một VECTOR trọng số, và thể loại chưa từng dùng nó để xếp hạng ai**. Rủi ro scalar **không nằm ở cách vẽ, mà ở hệ số tốc độ 2–3× gắn vào đỉnh** |
| **悟道点** | Ngân sách chi có trần để mở 大道 | ✗ | 83 ở 元婴后期, 98–108 ở 化神后期, cần 13 cho nút đầu tiên. **✗ ĐÃ SỬA: nhãn `isScalarRisk:false` dựa trên lập luận mà đồng thời sẽ xoá 战力** |
| **道心** | Đức hạnh theo cảnh giới, **reset về 0 mỗi lần thăng** | ✗ | **Chỉ số anti-scalar sạch nhất trong corpus.** Nó **không so sánh được giữa hai người** vì nó không sống sót qua cảnh giới; nó được nâng bằng sự kiện trong cảnh giới; và ở 100 nó biến phép kiểm phản xạ thành một lần qua chắc chắn |
| **神识** | Ở 修仙家族模拟器2: chuỗi chuyển đổi ba bước — 神识/10 = giây nhìn thấy, giây/5 = số lần thử, lần thử/8 = xác suất | ✗ | Ở mức gốc 100 神识 cho **25%**. **Thành phần thật là CẤU TRÚC: hai trục độc lập, một trong hai có trần, CỘNG LẠI thành xác suất** — đó là cơ chế anti-scalar thật, và bản tổng hợp mô tả từng nửa riêng lẻ mà không nhận ra chúng **hợp thành** |
| **经脉强度** | Phần thưởng suy ra theo cảnh giới, ~15 ở 炼气大圆满 | ✗ | Một tỉ lệ cộng vào **xác suất của đúng một cổng**. **Một điều chỉnh cục bộ trên một phép kiểm cục bộ, không phải tổng nhân vật** |
| **寿元 / 大限** | Tuổi thọ, xử lý như **bể tiêu** chứ không phải trần | ✗ | *(đã sửa — xem `REFUTATIONS.md` §1.9)* |
| **丹毒 / 耐药性** | Độc tích luỹ từ ăn đan | ✗ | Một sổ nợ tự gây. Trên 50 rút bớt một lá; khoảng 80 rút bớt hai; **tại 120 chết** — *ngưỡng giữa bị nguồn hedge (好像80), **không được trích như số chắc*** |
| **伤势 / 心魔 / 魔念 / 入魔值** | Bốn sổ nợ có dấu khác nhau | ✗ | **魔念 là cái tốt nhất**: thang 10/50/100 **giảm** tốc tu, tỉ lệ đột phá và phòng thủ, **đồng thời tăng** công thân thể và pháp thuật — **một trao đổi, không phải một thứ hạng** |
| **声望 / 威望 / 功德 / 名誉** | Bốn tiền tệ uy tín ở bốn game khác nhau | ✗ | `凡人修仙传：人界篇` chặn **toàn bộ** thang nhiệm vụ bằng 职位 mua bằng 威望 **và không gì khác** — thang phần thưởng không-power-score tốt nhất trong thể loại. `鬼谷八荒` 的 正魔值 có **nguồn lớn nhất là gia nhập tông môn** — đúng cơ chế làm một tu sĩ ma đạo bên trong một hệ chính đạo |
| **正魔值 / 立场** | Đứng phái có dấu | ✗ | **Chỉ số ít được đọc nhất trong corpus** |
| **精纯** | Chỉ số tinh khiết của 太吾绘卷 | **✓** | Số có trật tự toàn phần nhất. **Vĩnh viễn, thừa kế dọc dòng (精纯值可传承), hiện cho người chơi, suy ra được** — mỗi boss 剑冢 mang 3 điểm. *(Nửa đọc được mà không ai trích: nó bị chặn theo **tỉ lệ máu boss** (ngưỡng 25/50/75%), và **dải thừa kế** là nửa legible)* |
| **Ba đồng hồ trận pháp** (稳定/规模/负荷) | Ba số đã công bố về một trận, **cạnh tranh lẫn nhau** | ✗ | **Cấu trúc non-scalar tốt nhất trong lĩnh vực** — và nó chỉ tồn tại trên **một trong hai** hệ trận của ACS |
| **造诣 / 心境** | Bộ đếm kỹ năng chế tạo một mục đích, chặn phẩm cấp đầu ra | ✗ | **Đúng** khi từ chối thăng lên GENRE_CANON. 太吾: 造诣 đặt **TRẦN**, còn 引子 đặt **phẩm thật** |
| **鉴源估值** | Giá trị vật phẩm tốt nhất, từ chối cộng túi | ✗ | Bảng xếp hạng là **câu trả lời trực tiếp cho luật của chính dự án** |

---


Đây là cái danh sách ta đang **thoát ra**. Nó dài hơn danh sách thú vị, và đó là tin.

**Xương và hệ thống:**
1. `炼气 → 筑基 → 金丹 → 元婴 → 化神`, với 结丹/金丹/结晶 hoán đổi tự do — *không phải phổ quát ở game*: 鬼谷八荒 dùng 结晶 và chèn 具灵; 寻道大千 **bỏ qua bốn trong năm**; 完美世界手游 mười tám cảnh giới không có cái nào trong danh sách
2. Một viên đan được uống để đột phá, và đan tốt hơn thì tỉ lệ cao hơn — *4 game trên 12, không phải phổ quát*
3. 天劫 bắn ở mỗi ranh giới cảnh giới, nhiều sét hơn ở cảnh giới cao — **số sét (39/69/99 mỗi tầng nhỏ ở 鬼谷八荒) là tinh chỉnh của một studio, bị ghi là canon**
4. `凡品/灵品/宝品/仙品/神品` — năm hay sáu bậc, năm hay sáu màu, **và màu là con số người chơi đọc**. Phải đọc trong năm giây khi rơi đồ. Bảng respawn của 凡人修仙传OL: **xanh 1 mỗi bản đồ mỗi 1–2 giờ, tím 3 mỗi khu vực mỗi 6–12 giờ, cam 1 mỗi khu vực mỗi tuần**
5. **Một con số lớn ở góc màn hình** — xếp hạng là đầu ra mặc định, **có trước F2P mobile hai mươi năm**. Hướng dẫn cộng đồng của 逆水寒 bảo phớt lời nó
6. 闭关 / 挂机 với sản lượng offline — **động từ là giả tưởng cốt lõi của thể loại, có trước đồng hồ năng lượng vài trăm năm**. Cái thuộc về nền tảng là **TRẦN NGÀY** trên đó, không phải thực hành
7. 日常 — năm nhiệm vụ nhỏ mỗi ngày, reroll được, **một túi phần thưởng giống nhau bất kể năm cái nào**. 殊途同归 của 逆水寒手游: năm nhiệm vụ, reroll vô hạn, cùng túi — và **phần tốt nhất studio tự nói là 一分钟内就可以完成5个任务**
8. Cửa sổ làm mới ở giờ cố định (00:00/10:00/18:00) — cụm từ cộng đồng cho bản của 寻道大千 là **拼的就是卡点上班**, tức game thừa nhận lịch chính là game
9. Cửa hàng tiền mặt bán thứ mà grind chậm — **kiếm tiền cần một van, và grind là thứ duy nhất có áp lực**
10. 灵根 là một lần roll một lần, phần lớn chỉ để quyết định **tông môn nào sẽ nhận bạn** — **nhiệm vụ cơ học của nó rất hẹp**
11. 洞府 là nâng cấp tốc độ tu luyện **chặn theo thứ hạng tông môn**
12. 灵石 là tiền mềm đơn nhất, chỉ phân biệt bằng 绑定 vs 自由 — **đó là kinh tế thật của MMO Trung Quốc và không ai bề mặt hoá nó**
13. **Trang bị cộng +N và con số chỉ đi lên** — *bị ghi là PLATFORM_ARTEFACT, **đó là sai**: nó có trong Path of Exile, Diablo 4, 逆水寒, 剑网3, 诛仙, 古剑奇谭 và luật vật phẩm đấu bàn. **Cơ chế phổ quát nhất lĩnh vực, có trước mọi thiết bị kiếm tiền***
14. Thang uy tín mở cửa hàng, danh hiệu và nội dung — bảng của 剑网3 là **mặt nạ truy cập ở đáy, nguồn quyền lực ở giữa, và không gì cả ở năm trong mười ba bậc**
15. Một bức tường chỉ cốt truyện chính phá được (30.000/50.000/70.000 修为) — **hệ quả đúng cho agent: agent farm giỏi nhất là agent **đình**. Đó chính là lỗi**
16. Boss thế giới ở giờ cố định, trả theo thứ hạng sát thương
17. Miễn nhiễm offline: 8 giờ, +1 bền/giờ, 100 bền — **một tính năng công bằng trên một thế giới thời gian thực. Nó cũng là một đồng hồ mà agent không tham gia được**
18. **阵法 là tập cờ cờ, mỗi lá cộng đúng một chỉ số phẳng** — 4399凡人修真 là dạng thuần: **một 阵眼 không nâng được, tám 阵旗 không trùng loại, đúng tám chỉ số**, ghép 5-to-1, 10.000 và 50.000 đồng mỗi bước. **Đây là một gói chỉ số mặc tên trận pháp**
19. Thú nuôi là một thanh 好感度 cộng một đóng góp 战力 — **đây là cách một bộ sưu tậm trở thành power score**
20. Quái biến thể hiếm **cùng cấp** — 狂暴/护宝/无敌 野狼, **đều cấp 4**. Chi phí nội dung scale theo model chứ không theo chỉ số, nên studio mua độ khó bằng một tiền tố tên
21. 前期/中期/后期 là ba tầng nhỏ của một cảnh giới — **cách một đội nhỏ có bốn hoặc mười nhịp nội dung từ một cảnh giới mà không phải sáng tác gì**
22. 秘境 / 副本 là một căn phòng instanced giới hạn ngày với xếp sao
23. 转生 / 飞升 là lối thoát trần, sau một chuỗi nhiệm vụ
24. — *(các mục còn lại của bảng: 一念 Story tiếp tục ở bản gốc)*

---


1. **Không cơ chế nào đòi MỘT con số xếp hạng toàn bộ tu sĩ.** [luật repo; corpus cung cấp bằng chứng cưỡng chế]
2. **Không cơ chế nào đòi thương lượng, phối hợp, hay một nghĩa vụ nợ với agent khác.**
3. **Không cơ chế phản xạ nào, và không cân bằng nào giả định người chơi save-scum.** Agent không nạp lại, không thử lại một khung hình, không giữ phím. **[Đính chính từ critic: vế sau của ràng buộc này là phổ quát âm tính trên một corpus không nêu, và quá rộng — MMO **có** ship chat trong trận. Coi nó là một khuyến nghị thiết kế, không phải định luật.]**
4. **Mọi cổng phải kiểm được vào thời điểm quyết định, không phải vào lúc nhận; và mọi đầu vào chiến đấu phải là lựa chọn từ một tập hữu hạn.**
5. **Mọi thời lượng phải tính bằng LƯỢT. Không có giây trong kinh tế.**
6. **Mọi cổng agent có thể trượt cần một cổng bạn luôn qua được.** [道心]
7. **Thời gian thực không bao giờ là tài nguyên, và khan hiếm theo đồng hồ chờ phải được một agent khác trả lời chứ không phải bằng kiên nhẫn.** [ba hình dạng đã ship để tránh]
8. **Không bề mặt micromanagement.** Nếu một màn hình tốn người hàng giờ, nó không phải nội dung.
9. **Không thứ gì agent phải duy trì bằng lặp lại.**
10. **Nghĩa vụ phân loại, cưỡng chế bằng máy: không bao giờ ship một cơ chế là GENRE_CANON mà một studio đã viết ra là của riêng họ.**
11. **Mọi con số phải mang đơn vị VÀ mẫu số, và một con số không có nguồn công bố thì không vào tài liệu thiết kế.**
12. **Xếp hạng phải theo nhóm tuổi, không bao giờ toàn cục.** [梦幻西游, hai mươi năm]
13. **Tham số gặp gỡ phải được đóng băng tại thời điểm người chơi quan sát được lần đầu.** [修仙门派2 nói thẳng cho 兽潮 của nó: 「兽潮的境界、成员数量和战力会在预警生成时确定，预警期间即使宗门升级，本轮兽潮的强度和奖励也不会发生变化」]

---


Đợt 2, 2026-09-30: `character-design` `levels` `cultivation-value` `equipment` `items`
`talismans` `formations` `weaponcraft` `technique-taxonomy` `combat` `mobs` `quests` `factions`
`generation` `cosmology` `progressioncurve` `failure` — mỗi domain một researcher, một
skeptic, `effort: high`.

**Bắt buộc đọc kèm**: `REFUTATIONS.md` §2 (chiến đấu vắng mặt, 乘区, bằng chứng sai loại),
`GENRE-CANON.md`, `OPEN-QUESTIONS.md`.

---

# 6. Cơ chế chuyển hình

> **🟡 MỘT PHẦN.** Một cơ chế đã xác minh. Một câu hỏi chưa có đáp án — và câu hỏi đó quyết
> định phần còn lại.

### 6.1 Đã xác minh

> **dựng lên → xoá → thay bằng trạng thái kế.** Và không ai — **kể cả agent** — biết trạng thái
> trước đã tồn tại.

Nguồn duy nhất ta có là 沙画, và nó **đúng bất kể phương tiện**:

> 「将画好的画盖掉，是为了**后面更好地呈现**。这在别人看来可能是悲凉的，但在我看来**这才是沙画
> 生命力所在**。」

Và kỹ thuật lõi **không phải lúc vẽ, mà là lúc xoá**:

> 「沙动画精妙之处在于**擦除沙子时的衔接设计**。」

Bằng chứng thương mại: game tu tiên 《以仙之名》 (小牛互娱, 2021) dùng **角色群像沙画** của
茗喆S + 方浪浪 cho đợt beta — thế giới quan, **仙魔大战**, rồi từng nhân vật hiện ra kèm câu
tự trình. **Tu tiên + ngôn ngữ hình ảnh này đã có người mua.**

### 6.2 Sửa một chỗ tôi đã gộp nhầm

`扮猪吃虎` và cơ chế này **không phải một**:

| | Là gì | Ở đây ai chơi |
|---|---|---|
| `扮猪吃虎` | **một trope kể chuyện** — giả yếu để che giấu thực lực | **agent**, chơi bằng `Scope` chứ không bằng pixel |
| dựng → xoá → thay trạng thái | **một cơ chế chuyển hình thị giác** | **renderer** |

Chúng kết hợp được. Chúng không cùng tên, và tôi đã gọi cái này bằng tên cái kia.

### 6.3 ⬜ Câu hỏi quan trọng nhất của mục này

> *Dựng → xoá → thay trạng thái* có phải là ngôn ngữ **của 沙雕动画**, hay chỉ là thứ tôi mang
> sang từ một phương tiện khác?

Nếu là thứ nhất — research 沙画 là research thật, và chỉ mất chỗ *nguồn* chứ không mất điều
gì. Nếu là thứ hai — thì §3, cùng các mục character/pose/expression và camera/transition, quyết
định cái thay thế, và **cả ba đều chưa ai nhìn.**

Đây là câu hỏi đầu tiên của đợt nghiên cứu tới.


---

# 7. Agent là người chơi

> Sáu thay đổi bắt buộc khi người chơi là LLM agent.

> Đây là tài liệu quan trọng nhất trong dự án. Mọi thứ ở `DAU-LU-NHAN-VAT-COT-TRUYEN.md`
> được viết cho **người chơi**. Tài liệu này viết cho **agent chơi**, và nó **xoá**
> một phần lớn những gì tài liệu kia dựa vào.

---

#### 1. Phát hiện phá vỡ thiết kế

Nghiên cứu *Playing repeated games with large language models* (Nature, 2025), kết luận
rõ và đo được:

> LLM **chơi tốt** các game **lợi ích riêng tư** (họ hàng Prisoner's Dilemma).
> LLM **chơi kém** các game **cần phối hợp** (Battle of the Sexes).
> GPT-4 **trả đũa lặp lại chỉ sau một lần bị phản bội**.

Điều đó không phải chi tiết phụ. **Xây tông môn là game phối hợp thuần túy.**

- Chia linh dược giữa ba đệ tử → phối hợp
- Nuôi đệ tử mà không giết họ → phối hợp
- Thương lượng với lái buôn, tông môn khác → phối hợp
- Giữ bí mật chung với đệ tử → phối hợp
- Chia tài nguyên mà không tranh chấp → phối hợp

**Bốn trong năm thứ ACS bị chê nặng nhất — micromanagement, AI vô lý, tutorial hỏng,
quá phức tạp — đều là triệu chứng của cùng một căn bệnh: thiết kế cho người có tay
chân và trí nhớ.**

Agent không có tay chân. Agent có: một cửa sổ ngữ cảnh, một chuỗi suy nghĩ, và khả
năng **quên**.

---

#### 2. Ba loại agent chơi — chọn sai là chết dự án

| Loại | Ai chơi | Game thật sự là gì |
|---|---|---|
| **A. Agent quan sát** | Ta đưa agent vào xem thế giới; người khác đánh | Game thế giới mở. Agent là **mắt**. Nhận thức ký ức = hệ thống chính |
| **B. Agent điều khiển một nhân vật** | Ta chạy một agent điều khiển Chu Chính Vân | RPG. Agent là **người chơi**. Cốt truyện phải **kiểm chứng được** |
| **C. Nhiều agent đối đấu** | Mỗi agent một tông môn, chơi nhau | Đấu trường. Sản phẩm là **bảng xếp hạng sống** |

**Đề xuất: C, gốc rễ là A.**

Lý do: ở C, **cốt truyện không còn là nội dung, nó là hệ quả**. Agent chơi tông môn
của tôi, tôi không viết gì cả — chỉ ghi lại và phát ra. Và vì vậy:

- Không ai chết vì "không hiểu mechanic"
- Không ai bị kẹt vì tutorial
- Một cốt truyện tốt là cốt truyện **có thể tái dựng lại từ log**, không phải thứ
  được thuận tay

Đây cũng là lý do GDD cũ phải bỏ. Bản nháp viết chương 1, viết sẵn ba tuyến, viết
sẵn phản diện. Ở C, **người khác chơi**, và những thứ đó là dữ liệu đầu vào, không
phải kịch bản.

---

#### 3. Sáu thay đổi bắt buộc

##### 3.1 Mọi thứ phải đọc được bằng máy

Agent không nhìn hình. Mọi trạng thái phải là **JSON có kiểu**, không phải pixel.

Thứ tự ưu tiên hiển thị — phần nào **đi vào cửa sổ ngữ cảnh**, phần nào chỉ cho người:

| Vào ngữ cảnh (agent đọc) | Chỉ cho người xem |
|---|---|
| Tu vi, linh lực, tài nguyên | Hiệu ứng hạt |
| Trạng thái đệ tử, tâm trạng | Hoa, cỏ, mây |
| Danh tiếng cửa quầy | Ánh sáng, bóng |
| Bản đồ khu đã mở khoá | Hiệu ứng thời tiết |

**Không có thứ quan trọng nào chỉ tồn tại trong hình.** Một luật chơi mà người nhìn
thấy mà agent không đọc được là luật chơi không tồn tại.

##### 3.2 Phối hợp phải **tính được**, không phải cảm được

Đây là thay đổi đắt nhất và bắt buộc nhất.

**Sai** (bản nháp hiện tại):
> "Đệ tử có tinh thần sẽ làm việc tốt hơn."

Agent **không** biết điều đó một cách tự nhiên, và nếu biết thì cũng không
**làm** được — vì phối hợp là điều LLM làm kém.

**Đúng:**
> "Đệ tử làm việc ở tốc độ = cơ sở × tâm trạng × hạn mức."

Mọi thứ agent cần biết để phối hợp **phải là con số**. Không phải "anh tin tưởng
cậu chứ?" mà là "hạn mức giảm 30% vì tin tưởng 0.4".

Tình cảm vẫn có — nhưng nó là **một con số có tên**, và con số đó là thứ agent điều
khiển được.

##### 3.3 Micromanagement giết chết agent

Agent không chịu được 20 quyết định nhỏ mỗi ngày. Giữ một phiên bản **đúng như
thiết kế** của người chơi: 3–5 quyết định *có hậu quả* mỗi chu kỳ. Phần còn lại
là hệ quả, không phải việc phải làm.

Đây là nơi phong thủy phải làm việc **mạnh hơn**: nó cho phép tối ưu từ vài quyết
định thay vì micromanage. Đặt một cây bách — phong thủy cả khu vực tăng — là một
quyết định. Bảy món đồ trong một phòng là bảy quyết định.

##### 3.4 Không có permadeath

Agent **không học được từ một save hỏng**. Nó không nhớ lần trước. Trong *Cultist
Simulator* người chơi học bằng cách chết và thử lại — đó là hành vi **người**.

Với agent: chết = hỏng vĩnh viễn, chậm, và đắt.

→ **Không chết.** Hoặc chết thì **snapshot trước đó được giữ** và agent được chạy
lại từ đó. Chi phí bằng 0 với hệ thống, và nó biến thất bại thành dữ liệu.

##### 3.5 Tác vụ phải **kiểm chứng được**, không phải khám phá

Tài liệu cũ nói: "tuyến Nghịch Thiên chỉ mở nếu người chơi tự tìm ra trang cuối
sách."

Agent sẽ không tìm. Nó sẽ không bao giờ biết trang đó tồn tại. Tuyến đó sẽ tồn tại
trong thiết kế và không bao giờ xảy ra — tệ hơn là không có.

Quy tắc: **mọi trạng thái ẩn phải công khai được.** Nếu có thứ gì đó thay đổi kết
quả, agent phải đọc được nó ở đâu đó trong context.

Ngoại lệ duy nhất: bí mật của agent khác, vì đó mới là gameplay.

##### 3.6 Nhịp chơi: nhiều lượt ngắn, ít lượt dài

Agent giữ được context ngắn, mất context dài. Chu kỳ chơi phải **kết thúc được**
trong một cửa sổ context.

→ Một "lượt" = một ngày trong game, đóng gói thành **một kết quả JSON**. Agent chơi
N lượt, mỗi lượt là một lời gọi độc lập.

Điều này khớp với thiết kế sẵn có: chu kỳ sáng–trưa–chiều–tối của bản nháp **đã là**
một lượt. Nó chỉ cần được đặt tên lại.

---

#### 4. Danh hiệu (道號) — hệ thống từ research

Đây là phần bản nháp chưa có, và nó **rất hợp** với việc agent chơi, vì danh hiệu là
một con số công khai mà ai cũng đọc được.

##### 4.1 Quy tắc gốc, từ nguồn

| Loại | Ai đặt | Ví dụ |
|---|---|---|
| **法名** | **Sư phụ ban** — không tự đặt | 派字 (chữ thế hệ) |
| **道號** | **Tự đặt** | 純陽子, 重陽子, 玄誠道人 |

Nguồn: *"法名 là do sư phụ ban cho đệ tử… 道號 là do tu sĩ tự lấy theo đặc điểm bản
thân"*.

**Cái hay nhất cho game:** 法名 có **chữ thế hệ chung**. Mọi đệ tử một đời chia sẻ
một chữ. Người chơi đọc hàng tên và **thấy ngay đời nào** — không cần tool nào.
Đây là trạng thái phân cấp nằm ngay trong tên, và agent đọc miễn phí.

```
Thanh Vân Tông đời 7:  雲青子 · 雲書子 · 雲硯子
```

##### 4.2 Thứ tự hậu tố — phải đúng, vì sai là sai văn hoá

| Trung tính | Nam tính | Nữ tính | Cấp |
|---|---|---|---|
| 子 zi | 君 jūn | — | thấp |
| 尊 zun | 先生 | 仙姑 | trung |
| 散人 sanren | — | — | trung (tự do) |
| 真人 zhenren | — | — | **cao** |
| 道人 daoren | — | — | **cao nhất trong nhóm -人** |
| 居士 jūshì | — | — | văn nhân |
| — | 天尊 tianzun | 娘娘 niangniang | **tiên thượng** |

Hai quy tắc quan trọng nhất, và nguồn nói rõ:

1. **Phần lớn 道號 không mang giới tính** — nguồn khẳng định. Dùng 子, 散人, 尊 cho
   an toàn. Chỉ 君 là rõ là nam.
2. **Đa số 道號 có đúng 2 chữ**, rồi hậu tố. `Zewu-jun`, `Hanguang-jun`.

##### 4.3 Vì sao danh hiệu là cơ chế, không phải trang trí

Nguồn nói thẳng: danh hiệu **thay tên thật trong tu chân giới**. Đệ tử gọi nhau
bằng 師兄/師弟, không bằng tên.

Và có một câu từ nguồn rất đáng giữ:

> *"Một nhân vật đôi khi quá mạnh hoặc quá đáng sợ để gọi bằng tên sinh. Người ta đặt
> biệt danh theo bộ pháp, vũ khí, hoặc tai tiếng."*

**Đây là cơ chế cảm xúc mạnh nhất của cốt truyện tu tiên**: danh hiệu là cách
thế giới đánh giá bạn, và bạn **chỉ kiểm soát được nó bằng hành động, không kiểm
soát bằng lời nói**.

##### 4.4 Câu hỏi ba, để sinh danh hiệu

Nguồn khuyên hỏi ba câu khi đặt danh hiệu:

> **Ai đặt? Ai công nhận? Ai oán giận?**

Đây chính là **bốn số** trong hệ thống agent:

```json
{
  "daoHao": {
    "name": "雲青子",
    "grantedBy": null,
    "recognisedBy": 0,
    "resentedBy": 0,
    "unclaimed": true
  }
}
```

- `unclaimed: true` → ai cũng gọi bằng tên thật
- Đạt ngưỡng → **phải khai báo**, hệ thống **sinh tên** từ hành vi
- `resentedBy > recognisedBy` → một danh hiệu khác: nhân vật bị gọi bằng tên khiến
  khó chịu

Agent **không tự viết tên**. Nó khai báo, hệ thống tạo. Vì agent văn bản sẽ ra những
cái tên chẳng qua đâu đó.

---

#### 5. Chương 1, viết lại cho agent

Tôi **xoá** ba phần của tài liệu cũ:

| Xoá | Vì sao |
|---|---|
| Ba lựa chọn bằng menu ở cuối chương | Agent cần **lời gọi tool**, không cần menu. Ba lời gọi = ba action khác nhau |
| Tuyến Nghịch Thiên mở khi "tự tìm trang cuối" | Agent sẽ không tìm. Nếu ẩn thì phải là **bí mật của agent khác** |
| Hồi 3 đối thoại với Tạ Chi Dã | Đối thoại tự do là nơi agent yếu nhất. Thay bằng **một lời nói có sẵn** + hành động |

##### Lượt 1 — `settle` (dọn núi)

```
Mục tiêu: có 3 công trình đứng vững, 3 người sống.
Actions khả dụng: repair(building) × 3, forage(), talk(disciple) × 3
```

Điểm phong thủy: tường đông hướng sai. Agent phải **nhận ra** nó, và nó là thứ duy
nhất trong game mà agent sẽ phải suy luận. Đó là chỗ duy nhất tôi cho phép "ẩn".

##### Lượt 2 — `market` (chợ)

```
Tình huống: cần 40 linh thạch. Có 30. Đệ tử A sắp tâm ma cần 20 để chữa.
Actions: sell(manual) | sell(ore)×2 | borrow(merchant) | heal(A)
```

Đây là lượt quan trọng nhất chương, và là **bài kiểm tra liệu hệ thống có đủ sức
không**: một quyết định tài nguyên với **hậu quả xã hội hiện hữu** (cửa quầy đóng),
không phải một câu hỏi "bạn chọn gì".

##### Lượt 3 — `delve` (Vạn Dược Cốc)

```
Actions: gather(herb) × 4 | fight(beast) | track(signs) | press(Tạ Chi Dã)
```

`track` là action riêng. Nếu agent không gọi, `press` **không tồn tại** trong action
list. Không phải "gặp cảnh đặc biệt" — mà **không gọi thì không có**.

##### Lượt 4 — `resolve`

Bốn action, mỗi cái **mở đúng một chu kỳ tiếp theo**:

| Action | Mở khóa |
|---|---|
| `ascend_seek` (đi tìm sư phụ) | chu kỳ độc lập, không có tông môn |
| `rebuild` (ở lại) | chu kỳ tông môn |
| `sell_to_thanh_lien` (bán sách) | chu kỳ tông môn, nhưng **Cửa Quầy Vạn Nhược Hoa mở vĩnh viễn** |
| `read_last_page` | chỉ tồn tại nếu lượt 3 gọi `track` |

Bốn lựa chọn, **không điểm đạo đức, không cờng chiến**, chỉ là bốn lời gọi tool.

---

#### 6. Ba điều vẫn còn đúng

Một số thứ trong tài liệu cũ **không đổi**, và đáng giữ:

1. **Trúc Vi không đọc được sách** — trao đổi công bằng giữa hai agent có năng lực
   khác nhau vẫn là gameplay tốt, và nó hoạt động **tốt hơn** khi cả hai là agent.
2. **Vạn Nhược Hoa không gây ra đêm sụp đổ** — ông quyết định không cảnh báo. Phản
   diện tốt không cần là kẻ ác.
3. **Ba Ngày** là tên hay. Nó vẫn là tên hay, kể cả khi đếm ngược bằng lượt agent.

---

#### 7. Việc kế tiếp

| | |
|---|---|
| **1** | Tool schema: 12–16 action, viết bằng TypeScript với kiểu. Đây là **hợp đồng** với agent, và phải khóa sớm |
| **2** | Renderer trạng thái → JSON context. Viết một lần, dùng lại mọi nơi |
| **3** | Chương 1 chạy **không cần người**: `while not done: state = step(state, agent.decide(state))` |
| **4** | Chạy 30 agent khác nhau, xem cái nào chết và **vì sao** — đó là bài test thiết kế |

Bước 4 là bước quyết định. Nếu agent thua vì **lựa chọn tệ**, hệ thống ổn. Nếu
agent thua vì **không đọc được trạng thái**, hệ thống hỏng và số liệu hệ cối này mới
lộ ra.

---

#### Nguồn

- **Agent chơi game**: Nature 2025, *Playing repeated games with large language models*
  (điều phối hợp — điểm yếu chính); *LMGame-Bench* (arXiv 2505.15146 — thị giác giòn
  và nhạy cảm prompt là hai lỗi cấu trúc); *BALROG* (arXiv 2411.13543); *Survey on LLM
  Game Agents* (2404.02039)
- **Danh hiệu**: hướng dẫn văn hoá Trung Hoa cho người viết wuxia/xianxia (quy tắc
  hậu tố, giới tính); UCSD, *Chinese Personal Names & Titles*; *Xianxia Titles, Ranks
  and Honorifics* (ba câu hỏi: ai đặt, ai công nhận, ai oán giận)
- **Game**: *Amazing Cultivation Simulator* (vòng lặp tốt; AI, micromanagement, tutorial
  hỏng); Mitchell, Kway & Lee, *Storygameness* (người chơi học bằng cách chết — hành vi
  không chuyển được sang agent)


---

# 8. Sáu mâu thuẫn đã đóng

> RECONCILIATION — đơn vị lượt, visibility, verb, retry.

Bốn trong năm mâu thuẫn **không cần nghiên cứu thêm**; chúng là lỗi đơn vị và lỗi
schema, và sửa được bằng một quyết định mỗi cái. Tài liệu này đóng chúng và chỉ ra
cái nào **thực sự** còn cần đo.

Mọi quyết định dưới đây là của tôi trừ khi ghi rõ **cần bạn chốt**.

---

#### Q1. Độ dài lượt — và cách dập tắt cả lớp lỗi này

##### Vì sao năm con số

Mỗi section tự suy ra độ dài lượt từ một giả định khác nhau, rồi dùng nó để tính tiếp.
Không ai sai riêng lẻ — sai vì **đơn vị bị suy ra bốn lần**.

##### Vì sao "chốt một con số" chưa đủ

Ngay cả khi chốt, hệ thống vẫn có một đường chuyển đổi: giây thật → giây trong game
→ lượt. Ba chỗ có thể lệch, và report đã lệch ở cả ba.

**Nên: bỏ giây khỏi kinh tế hoàn toàn.**

##### Quyết định

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

##### Và điều này sửa vấn đề kinh tế mà giả thuyết trước không sửa được

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

##### Hệ quả bắt buộc

Tỉ lệ bước no-op vẫn **chưa biết** (xem `RESEARCH-INDEX.md`, điểm 5). Với đơn vị lượt,
phép đo còn lại là: **30 lời gọi LLM, hash chênh lệch trạng thái mỗi lượt, 5 phút.**
Không cần gì khác.

---

#### Q2. Nguyên thủy visibility — một kiểu, và chọn default-deny

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

#### Q3. Union action — thêm ba verb mà report dùng mà schema không có

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

#### Q4. Retry — chọn, và nói rõ cái giá

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

#### Q5. 隐忍 — và sáu mục tiêu duty cycle

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

#### Q6. Sổ cái và uy tín phai — giữ chính sách determinism

Mâu thuẫn còn lại: Kinh tế cho phép uy tín **phai sau 30 ngày**, Ba khán giả đòi TTL
tính từ `occurredAt` để replay là hàm thuần.

> **Quyết định: determinism thắng.** TTL tính từ `occurredAt`, và log **ghi lại giá trị
> tại mốc**, không chỉ giá trị hiện tại.

Cái giá: log to hơn. Cái mua: người đọc sau 40 ngày dựng lại được giá trị đã phai, và
`determinism` của `public-replay.md` được giữ nguyên. Report đã áp chính sách này cho
TTL rồi bỏ nó cho decay — không có lý do.

---

#### Tổng hợp: còn gì thực sự chưa biết

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

#### Nguồn của các quyết định này

| Quyết định | Từ đâu |
|---|---|
| Đơn vị lượt, bỏ giây | `agent-agents` critic §1.1 — cùng một phép chia ra hai kết quả |
| Một projector, ba lời gọi | `public-replay.md`, `activity/src/replay.ts` đã ship |
| Default-deny | `public-replay.md`: event lạ thì **rơi**, không chuyển tiếp |
| Retry giữ + đánh dấu | `public-replay.md`: replay là hàm thuần của log bền |
| TTL theo `occurredAt` | `public-replay.md`: cùng nguyên tắc |
| Bỏ 隐忍 | Vòng lặp §2.3 tự nói hai điều kiện loại trừ nhau |
| Ngưỡng 0,80 đo được | Lấy từ mục tiêu đã có trong Sản xuất §7 và Agent chơi §3.3, và **thay** bằng phép đo |


---

# 9. Bằng chứng đã bị bác

> 109 agent, ba đợt. **Mọi đợt đều tự bác bỏ chính bản tổng hợp của nó.** Đọc trước khi tin bất kỳ mục nào.

**Ngày: 2026-09-30. 76 agent, 11,2M subagent token, hai đợt.**

Tài liệu này là **phần đáng đọc nhất** của cả hai đợt nghiên cứu, và nó nằm ở đây vì
lý do mà `.research/critic.md` từng nói trước:

> *"A refutation pass keyed on 'was the number wrong' cannot touch a decision that has no
> number."*

Hai đợt nghiên cứu sau đó lặp lại đúng cái bẫo đó, **trên chính bản tổng hợp do chúng
sinh ra**. Mỗi đợt đều kết thúc bằng một critic đọc nguyên văn tài liệu tổng hợp và
tìm ra lỗi ở tầng nguồn. Dưới đây là những lỗi đó, giữ nguyên sắc độ.

---

#### Cách đọc tài liệu này

Mỗi mục có một nhãn:

| Nhãn | Nghĩa là |
|---|---|
| **BẮC** | Claim sai. Có nguồn đối chiếu. Đừng dùng. |
| **ĐẢO** | Claim đúng nhưng lập luận dựng trên nó thì không. |
| **VỠ** | Claim đúng nhưng mang nhiều kỳ vọng hơn bằng chứng. Hạ cấp xuống giả thuyết. |
| **THỪA** | Không ai cần nó. |

Và một quy tắc đọc, áp dụng cho mọi mục:

> **"Đúng một game"** trong hai bản tổng hợp nghĩa là *"đúng một trong ~15 game mà ai
> đó tìm thấy wiki"*. Đó là **tần suất mẫu**, không phải tần suất thế giới. Critic
> đã kiểm toán đúng một negative (`ACS 品阶`) — **nó sai**, và sinh ra ba artefact dẻ
> xuống. Chính bản tổng hợp ghi nhận điều đó rồi không tổng quát hoá.

---


#### 1.1 BẮC — `云墟修仙录` bị trích sai, và nó mang hard constraint quan trọng nhất

Bản tổng hợp viết:

> *"云墟修仙录's official guide, from 金丹 onward every tribulation resolves on one line:
> 胜负只看一条：你的战力 ≥ 雷劫战力就成功，否则必败"*

và dựng cả danger entry đậm đặc nhất lên đó — *"This is the purest instance of the failure
in the entire sweep, and it ships."*

**Game không làm vậy.** `云墟修仙录` là **休闲/文字 Roguelike** của 云墟仙途工作室 (studio
đứng sau 养娃模拟器), phát hành TapTap, **10–20 phút mỗi lượt**. Hướng dẫn thật của nó
trên diễn đàn nhà phát triển tài liệu **bảng xác suất ba kết quả**:

| 战力 (% mức cần) | 成功率 | 死亡率 |
|---|---|---|
| 100% | 80% | 0% |
| 85% | 62% | 8% |
| 70% | 40% | 20% |
| <50% | 大概率死 | — |

Cộng talent mua được: **万劫雷池: 渡劫门槛降低20%**.

Đó là **bề mặt xác suất trên một tỉ lệ, có giảm nhẹ mua được** — không phải một phép so
sánh nhị phân. Câu tôi trích **không có trong văn bản game**; nó là diễn giải từ diễn
đàn, và bản tổng hợp gán nó là *"official"*.

**Hệ quả theo thứ tự thiệt hại:**

1. **Hard Constraint #2 mất chứng cứ.** Tuyên bố *"tử thần không được phán bằng so sánh
   ngưỡng"* vẫn **có lý** — nhưng bằng chứng của nó bây giờ không dùng được. Và
   nguồn bản gốc duy nhất phán tử thôn **không theo ngưỡng** (mục 1.2) làm cho lập luận
   đứng vững hơn.
2. Con số *"at least six shipped games"* không kiểm chứng được, và game được nêu tên
   không nằm trong sáu cái đó.

**Cùng game, phát hiện tệ hơn, tìm thấy trong cùng nguồn — nhưng bản tổng hợp tìm thấy
phiên bản mềm hơn và gán nhầm cho 诛仙:**

> 「心魔别超过 60… 心魔到 100 会触发正道通缉，下次出门就有一个大佬来砍你，**战力比你高
> 2000，基本必死**」

Một số nguyên ẩn vượt 100 triệu ra một kẻ thù có **lợi thế +2000 sức mạnh** — một án
tử do con số mà người chơi **không hề được báo là mang tải**. Đây phải đứng đầu
danger list, gán đúng nguồn.

#### 1.2 BẮC — `封神演义` CÓ điều khoản tử thần, và nó gắn với **việc đã làm**

Bản tổng hợp viết: *"the three root traditions use incompatible tribulation cadences
(封神 has no 三灾 at all and runs 1500 years…)"*. Hard Constraint #4 dựa một phần lên đó.

Critic mở `封神演义` chương 99 trên ctext.org và Wikisource. Nguyên văn:

> 「縱服氣煉形于島嶼，未曾斬卻三尸，**終歸五百年後之劫**；總抱真守一于玄關，若未超脫陽神，**難赴三千瑤池之約**。」

Ba lỗi trong một câu:

- **"no 三灾 at all"** — sai; văn bản có 劫, và đã mệnh danh.
- **"runs 1500 years"** — không có cơ sở; con số văn bản đưa là **500 và 3000**.
- **"no shared number to inherit"** — các truyền thống **gần nhau hơn** bản tổng hợp nói.

Và cái bản tổng hợp **bỏ lỡt**: `封神` còn nói rõ cơ chế cưỡng chế —

> 「**有功之日，循序而遷**」 — thăng chức **theo công trình**.

Và nó gắn điều kiện vào **việc đã hoàn thành** (斬三尸 / 陽神), **không phải một giá trị
sức mạnh**.

⇒ **Đây là bài kiểm tra tử thôn chống scalar, nằm trong nguyên văn gốc thế kỷ 16 — trong
chính tác phẩm mà bản tổng hợp dùng làm bằng chứng phủ định, ba lần.**

#### 1.3 THỪA — `封神` chương 99 còn chứa bảng vai trò, và nó bị bỏ

Cùng chương, critic đọc tiếp:

> **三百六十五位正神**, liệt kê đầy đủ chức vụ, xếp hạng tám bộ theo 「劫运之轻重」 và
> 「资品之高下」, với **黄飞虎 giữ quyền phán đoán toàn bộ sinh tử biến cải** —
> 「凡应生死转化人神仙鬼，俱从东岳勘对方许施行」.

Đây là **bảng vai trò cố định, công bố, liệt kê được, phân cấp theo công trình, cộng
một chức vụ phán đoán có tên**. Đó là hệ thống phân vai chống scalar, kiểm tra được bằng
máy, của chính thể loại — và tổ nguồn trực tiếp của `封神榜` trong văn hóa 洪荒.

#### 1.4 BẮC — Ba trích dẫn về LLM không khớp, và có phản chứng

Bản tổng hợp dùng tám hard constraint, và ba cái được viết **bằng ngữ pháp đo lường** (số
đếm cụ thể, phần trăm cụ thể). Critic **không khớp được**:

- `arXiv:2609.02580` (11 người mua / 11 người bán / bảng giá công bố)
- `arXiv:2509.09071` (người bán nhượng bộ quá mức)
- `arXiv:2604.11840` (5 agent, 15 lượt, 314/315, 0/135 khi bật suy luận)
- một paper *Nature Human Behaviour 2025* mang tên đó

Không kết luận là bịa. Kết luận là: **các phát hiện như đã nêu không phải điều tài liệu
tôi truy cập được nói** — và điều đó quan trọng, vì ba ràng buộc được viết bằng ngữ pháp
mà tài liệu cảnh báo.

**Tài liệu thực sự nói, và nó cắt hai chiều:**

**Phản chứng trực tiếp.** `arXiv:2603.18563` chứng minh agent LLM hiện thực **dưới dạng
mẫu hậu xác suất Bayes** thì **được bảo đảm hội tụ gần Nash** trong game lặp vô hạn, với
Qwen 3.5-27B qua năm môi trường gồm cả Trò chơi Nhân tài.

⇒ **"LLM không bao giờ hội tụ" không phải luật.** Nó là thuộc tính của agent dùng sẵn dưới
protocol cụ thể. Bản tổng hợp **đông cứng nó thành ràng buộc tuyệt đối** mà không nêu định
lý chỉ tay ngược lại.

**Phát hiện hữu ích hơn cái được báo.** `arXiv:2512.09254` ("The Illusion of Rationality",
NegotiationArena): mô hình **phân kỳ vào các cân bằng riêng theo model** thay vì hội tụ,
đề xuất **co cụm quanh các mốc tròn** (bội số của 5), và có **thứ hạng thống trị ổn định
giữa các model**. Phần neo mốc làm cho thiết kế của ta **dễ hơn**, không khó hơn: giá niêm
yết sẽ co cụm quanh số tròn, đó là lý do **có** sổ lệnh.

**Và cái bản tổng hợp không nêu, là đáng giá nhất:** một nghiên cứu tiền in (clawrXiv
2026.00007 — **coi là chưa kiểm**, số quá sạch) với **1.024 agent / 16 hàng hóa / 50.000
vòng**: chế độ **đấu giá liên tục hội tụ trong 3,2%** của cân bằng cạnh tranh, còn chế độ
giá niêm yết thì **không** (lệch 11,7%, người bán định giá quá 8–15%).

Và nó nêu đúng cái **chế độ thất bại** mà khoảng trống "công bố độ sâu" của bản tổng hợp
không hề biết: **hội tụ thành cartel âm thầm ở thị trường mỏng** — dưới **8 agent mỗi
bên mỗi hàng**, HHI > 2500 ở **73% lượt chạy**, **không hề giao tiếp**, thuần best-response.

⇒ **Nếu ta ship sổ lệnh, kẻ giết ta không phải thị trường chết — mà là một bè cartel
không ai nói.**

#### 1.5 BẮC — Nội dung bịa ở dạng **đúng** ngữ pháp đo lường

Bốn truy vấn rõ ràng nhất của critic trả về **bốn trang hướng dẫn bịa đặt**:

- `星辰变2` (rpcyzx.com): một sự cố rò rỉ dữ liệu "2026年2月官网后台", một URL
  `官网/weather/forecast`, ngưỡng "38 điểm", biên 4,7×, và khai thác kênh hỗ trợ với tỉ lệ
  bồi thường 23%.
- `33games.com.cn`: trích một báo cáo **không tồn tại** — 《修仙品类游戏数值模型深度分析报告》
  — với "68.3% of failures occur on attempts 3–5".
- `biligame.com.cn`: bảng phân rã 战力 sáu module, 抗性 45% vs 基础属性 15%, công thức,
  ví dụ tính, và chú thích ghi **"内部测试服数据"**.

**Và đây là điều bản tổng hợp nói sai về loại nguy hiểm.** Nó cảnh báo chỉ với *"a claim with
NO number but written in the grammar of a measurement"*. Loại nguy hiểm hơn, và là loại
critic **thật sự dính**, là **ngược lại: một con số bịa đặt trong ngữ pháp đo lường hoàn
hảo** — thứ lọt qua **mọi** kiểm tra mà bản tổng hợp liệt kê.

Và có một phát hiện thật giấu trong đống rác đó: **claim** của trang bịa (有效战力 ≠ 战力,
con số hiển thị không dự đoán kết quả) **trùng khớp một hệ thống có thật, có trên wiki**.
**Cùng một claim đúng, xuất hiện một lần trong nước bẩn và một lần trong wiki thật.** Cách
xử lý đúng: báo cáo wiki, vứt nước bẩn, và ghi rõ rằng sự tồn tại của nước bẩn khiến claim
sẽ **trông đáng nghi nếu trích cẩu thảo**.

#### 1.6 ĐẢO — "境界 không phải scalar" là một ngụy biện

Lập luận của bản tổng hợp: *"品阶 sits on the OBJECT and 境界 on the PERSON, which is exactly
why the genre never needed a power number."*

**Không suy ra được.** 境界 **có trật tự toàn phần trên người** — đó là định nghĩa của một
thang bậc. Đặt phẩm cấp lên vật thay vì người **không thủy chung con số**; nó **chia con số
làm hai và làm phần trên người khó gỡ hơn**.

Luật trong repo được thoả bằng **cổng năng lực**, và bản tổng hợp **tự đề xuất** ở đúng
đoạn văn đó — rồi không áp dụng nhất quán. Mâu thuẫn này **chịu tải**, vì toàn bộ giáo lý
chống scalar được lập luận từ nó.

#### 1.7 ĐẢO — "đúng một" sai ít nhất ba lần

| Claim | Thực tế |
|---|---|
| Artifact-as-claim chưa ai làm | **完美世界** đang **bán** nó: trang chính thức 诛仙2 (2024) nói 道无为学府 **「不以提升战力为导向」**, 仙枢师 **「可以根据修仙者的具体需求定制法宝属性，为法宝适配不同资质」** |
| Lịch thế giới chưa ai công bố nhịp | **修仙家族模拟器** patch 11.0.6: 天材地宝 **30 năm** một chu kỳ; chu kỳ thứ hai **100 → 50 năm**; xác suất mỗi đảo **0,5% → 1%**; **trần toàn cục 3 → 6** |
| Đỉnh thang là gánh nặng chưa ai làm | **云墟修仙录**: 春秋蝉 trần **3 tự hồi sinh**, **「每复活下降1个大境界」** — vật phẩm đỉnh **đưa bạn ra khỏi tầng** |

Cột đầu đúng hơn bản tổng hợp nói: custom-stats-and-reroll là **phiên bản tệ hơn** của đề
xuất của nó (một claim có điều kiện). Nên *"không ai làm **phiên bản tốt**"* còn đúng.

#### 1.8 ĐẢO — "Bị cắt như một drain" là lỗi phạm trù

Bản tổng hợp cắt cả họ kinh tế cạn kiệt, dựa trên:

> 「灵脉成形后便会自动散发出淡淡的灵气，让当地的灵气循环不绝，不会有枯竭之日」

Nhưng câu đó nói về **灵脉** — một **tính chất nơi chốn**. Bản tổng hợp khái quát từ *"nơi
chốn thì tái tạo được"* sang *"không nơi nào cạn"*, và xoá mất phần kinh tế thực sự vận
hành. `修仙家族模拟器` ship **不可再生矿石 (混沌金精, 赤炎晶) vs 可再生 (灵石矿洞)** như một
phân biệt được đặt tên, và patch 11.0.6 có **fix bug "矿藏耗尽后重复开采…造成透支或重复产出"**.
Game chạy mạch khoáng cạn và coi đó là thiết kế.

Và một dạng bị cắt mà không được gọi tên: **`凡人修仙` 的灵石矿洞 — 2 lượt miễn phí/ngày,
20 phút mỗi lượt, bản đồ PvP tự do, cướp được một phần khoáng của người chơi khác.** Tài
nguyên tranh chấp có thời hạn, giới hạn sức chứa, tranh chấp PvP — đúng dạng drain nguy hiểm
nhất với agent. Nếu ta ship tài nguyên tranh chấp, đó **là dạng phải từ chối**, và bản tổng
hợp từ chối **nhầm thứ**.

#### 1.9 ĐẢO — Mâu thuẫn nội tại về 寿元

Canon map nói *"寿元 is a CONSEQUENCE of 境界, not the scalar"*; inventory nói
**SHOULD_CUT**; Hard Constraint #4 cấm đồng hồ tính bằng năm. **Ba vị trí, một hệ thống.**

Cách hoà giải mà critic đưa ra và đã kiểm: **cắt 寿元 như một hạn chót; giữ nó như một tài
nguyên để mua hành động.** Bằng chứng: `云墟修仙录` bán **50000 灵石 cho 50 năm** — một
**cuộc đấu giá**. Đó là *mua* tính bằng năm, không phải *cổng* tính bằng năm, và là cơ chế
duy nhất về tuổi thọ trong toàn bộ sweep mà agent hành động được.

#### 1.10 ĐẢO — "Bằng chứng cho capacity-typed place grade là scalar"

Claim *"already half-built"* dựa trên hướng dẫn nói luật sức chứa **đồng thời mang điều
khoản dự phòng theo sức mạng** — chính điều khoản mà tác giả đã loại. Một thiết kế có bằng
chứng là điều khoản tác giả vứt bỏ thì **chưa được dựng**, chứ không phải dựng nửa vời.

**Thay bằng:** `打工修仙记` 的布阵 — mảng deploy được duy nhất là 聚灵阵, tác dụng
**灵气浓度 → 修炼速度**, và bài viết trên diện độ nhà phát triển gọi nó **「过于鸡肋，不推荐」**.
Một sản phẩm định-kiểu-sức-chứa đã ship, **không sinh con số sức mạnh nào**, và bị chính
tác giả của nó đánh giá là yếu.

#### 1.11 ĐẢO — Bẫy cộng dồn chưa được gọi tên

`剑侠奇缘` hướng dẫn chính thức: mỗi điểm kinh mạch hoàn thành cho **phần trăm** cộng thêm,
và hướng dẫn khuyên **trì hoãn vài điểm cuối** cho tới khi trang bị mạnh hơn
*"以获得更大的实际收益"*.

Một chỉ số là **phần trăm của phần trăm** là cách game dựng lại scalar từ bốn cái nhỏ. Nếu
ta lấy nhiều cổng năng lực, đây là chế độ thất bại phải đặt tên: **không cổng nào được trả
về một phần trăm của đầu ra của cổng khác.**

#### 1.12 Hệ thống bị bỏ sót — đây mới là tin thật

##### 内丹 — xương sống thật, và nó là **MẠCH**, không phải thang

Cả bản tổng hợp lấy 境界 làm xương sống. **Truyền thống không.** Truyền thống lấy
**内丹**: một mạch tuần hoàn **có cổng có kiểu và động từ có kiểu**.

- Cấu trúc: **筑基 → 炼精化气 (小周天) → 炼气化神 (大周天, 十月养胎) → 炼神还虚**
- Ba cửa: **百日关 / 十月关 / 九年关**; các cổng **三关: 尾闾 → 夹脊 → 玉枕**
- Ở 尾闾, khí có **bốn lối ra và 谷道 là lối chết** — rò ra là mất đan
  (「大药走失，最能伤人」)
- Mạch là **任督**, mở bằng **河车通**
- Động từ là **火候**, không phải đại lượng: **武火 / 文火 / 沐浴 / 止火**, với 十二消息卦
  và 进阳火/退阴符. 《灵宝毕法》 chia thành **mười ba 法门**

**Vì sao đây là tin tốt nhất của cả đợt:**

1. **筑基** — cái bản tổng hợp coi là một **bậc** — theo nguyên văn **là hành động mở một
   mạch**. Thể loại thứ hai của nó *đã là* một phép toán đồ thị. **Ta không cần phát minh;
   ta cần nhận ra.**
2. Độ khó **thuộc vị trí, không phải số**: cùng linh lực, cùng cảnh giới, hỏng ở node khác
   nhau tùy đường đi tới. **Không có con số nào để bơm.**
3. **火候 là một bộ chọn động từ** — đúng hình dạng của một lượt của agent.
4. **Vệ sinh nguồn có sẵn trong văn bản**: số đếm hô hào (216/36/180, 144/24/120, 60,
   闰余24, 合计384息) được truyền theo quy ước, và chú giải cổ **phủ nhận chúng là nghĩa
   đen** — 「至于三十六、二十四等说，均是设词」 và 「十二时与十二卦均属虚比」.
   Món quà hiếm: **một nguồn chính bảo bạn đừng trích số của chính nó.** Lấy tên giai đoạn,
   bỏ số đếm — và không ai có thể buộc tội vượt số.

##### 经脉 / 穴位 — đã ship, có thứ tự, và **đảo chiều được**

- **诛神 (2011)**: mười hai kinh chính, mỗi kinh có huyệt tên, **phải mở đúng thứ tự và
  không chạy ngược**, vật phẩm mở khóa chỉ lấy từ elite trong dungeon
- **`烟雨江湖`**: 经脉 **可以顺通，也可以逆通**, và **逆元丹 lật chiều một kinh mạch đã mở**
- **新蓬莱 / 剑侠奇缘**: 奇经八脉, mỗi kinh 24 điểm, có thứ tự trong kinh, tự do giữa các
  kinh; 剑侠奇缘 thêm **小周天 (8 kinh) → 大周天 (có kiểm)**, tức **hai vòng**, vòng hai
  mở từ tiến độ vòng một
- **Pity trên một đồ thị**: 冲穴 thất bại thì **cộng cứng 5 bước tiến độ**; tại trần thì tính
  là đã mở. **Thành và bại đều đẩy.**
- Bẫy cộng dồn **đã nằm trong văn bản chính thức**: cộng phần trăm trên chỉ số của chính
  mình, và hướng dẫn khuyên trì hoãn điểm cuối

⇒ Một hệ thống thân thể **có thứ tự, đảo chiều được, có pity công khai, có một điểm ba
lối nơi lối sai là chết, và không có con số nào trên nó.**

##### 洪荒 — một nhánh phụ với mô hình hai tài nguyên

- **气运 và 功德 là hai đường tích lũy riêng, chủ sở hữu khác nhau.** 气运 là tính liên tục
  của **教派/种族**; 功德 là chìa khoá đột phá của **cá nhân**
- **功德 phải TIÊU hoặc bạn rơi**: 「功德圣人…需要不断维护天地秩序，履行相应的职责，
  **否则可能跌落圣位**」 — quyền lực là hệ quả của **một nghĩa vụ còn tồn đọng**. Một
  **khoản nợ suy giảm, kiểm tra bằng máy, agent đọc được**. Không chỗ nào trong bản tổng
  hợp của tôi có khái niệm nợ
- **Phân phối được bởi bất kỳ ai có nó** — tài nguyên chuyển nhượng được, đơn vị có, cho
  không — **một tiền tệ không có thị trường và không mặc cả**
- **法宝 = quyền năng, không phải chỉ số**: 落宝金钱 = quyền tước đoạt, 穿心锁 = quyền giam,
  乾坤鼎 = quyền tạo hóa, 灭世大磨 = quyền chấm dứt
- **量劫 (bảng cố định) vs 杀劫 (nợ cá nhân)**: hai đồng hồ, một cái công khai một cái riêng

Nguồn phản chứng cùng trang, chất lượng nguyên văn, sweep không dùng: **混沌钟 không phải
từ 封神演义** (là 轩辕剑 của 大宇公司); **盘古化三清 là sáng tác của 《佛本是道》**;
**山海经 không có 十二祖巫**; **阐教十二金仙 là 港漫**; và **封神演义 không có thang phẩm
pháp bảo** — xác nhận điểm 天地玄黄 duy nhất còn sống của bản tổng hợp.

##### 契约 / 道誓 — thang cưỡng chế bốn bậc, và thể loại nói nó thủng

`长生修仙，从熟能生巧开始` chương 424 cho cả thang:

| Bậc | Hình thức | Hậu quả khi phản bội |
|---|---|---|
| **法契** | chủ yếu cho thương mại, trên da/thẻ/tre/gỗ/trúc/giấy | cưỡng chế yếu nhất — 「有不少破解或者取巧的方式规避」, 「**低阶法契可能被高阶修士强行破除**」 |
| **道誓** | không vật thể; thề cả 前途 lẫn 性命 | nổ **ở lần đột phá kế tiếp**, gây 道心裂痕 khiến đường 「异常坎坷，难以精进，甚至道基崩溃」 — **hình phạt là biến dạng vĩnh viễn tiến trình của chính bạn** |
| **心魔血契** | niêm phong máu | sinh **心魔 nhắm vào điểm yếu cụ thể** của người phạm tội; bản nâng cao **chạm tới hậu duệ** |
| **天道誓言** | cao nhất | 天罚 / 业火 / 气运衰败 |

**Câu mang tải, và nó chống lại thiết kế:** 「法契並不是万能的…所以修仙界依然十分看重
修士的**信誉声望**」.

⇒ **Hợp đồng là một điều chỉnh xác suất, không phải bảo đảm.** Phối hợp dựa trên hợp đồng
đơn thuần là một ván cược.

**Hazard agent mà bản tổng hợp bỏ:** hình phạm của 心魔血契 **là một bài đọc hiểu văn bản
tự do theo cấu trúc** (nó nhắm vào điểm yếu của bạn, hệ thống buộc phải đọc). Một trường
hợp nữa của cái trách nhiệm free-text mà nó đã gọi tên một lần rồi không tổng quát hoá.

##### 传讯/通讯 — thất bại trong im lặng

Ba mô hình đã ship:

- **千里传音螺** (một 符宝): một 重 chứa **3** 神魂刻印; 三重 chứa **27**. **Thang ô nhân
  đôi**, và sức chứa là một tập quyền, không phải một chỉ số
- **万里传音玉符**: tối đa **10** liên hệ, cần đóng dấu hai chiều
- **传音符**: 母符/子符, tầm gốc **三四十丈**, **mở rộng cả tông môn nhờ cưỡi 护门大阵**. Nếu
  母符 nằm ngoài tông môn, 子符 tìm **một đến hai canh giờ** rồi 「**自动消失，就像已经
  读过了一般**」

**Điều đó là ví dụ giáo dục về chính luật của repo.** Thể loại có sẵn ví dụ về một cơ chế
**không thể báo đỏ**: thất bại giống hệt thành công, không lỗi, không bounce, không đổi
state. Bất kỳ tầng phối hợp nào dựng trên message mà thiếu **biên nhận giao hàng** thừa hưởng
đúng cái thất bại đó. Bản tổng hợp **chưa cân nhắc message lần nào**.

Và khung đúng: 传音符 descends từ **兽角号令** của 共工/祝融 — **công cụ ra lệnh, không phải
điện thoại**. Agent không trò chuyện; chúng phát lệnh vào một hàng đợi.

##### 任务榜 / 悬赏板 — bộ phân phối chống mặc cả, ở đúng quy mô

**凡人修真 (4399) 天仙任务系统** (chính thức):

- **任务书 chế tạo được**, nấu từ 阵法残卷/技能书, có giá trị tiến độ, bốn bậc:
  **真仙 5 / 天仙 50 / 玄仙 150 / 金仙 300**, trần 300, sách dở mang sang
- **发布:** 99 cấp+, tiêu một 任务书, **5/ngày**, **người đăng được trả khi nhiệm vụ được
  NHẬN** — không phải khi hoàn thành
- **接取:** **5/ngày**, **không nhận được nhiệm vụ của chính mình**, **bỏ dở không hoàn
  lượt thử**
- Ba loại: 打怪 / **运镖 — nhiệm vụ giao đến cho một agent khác** / 完成三界任务
- **机缘值 → 机缘等级 → 机缘封号 → chiêu tinh bạn 散修**

**Đó là toàn bộ cái thiết kế trong một hệ thống.** Bảng công khai, giới hạn tần suất,
kiểm tra bằng máy. **Tiền chạy khi hành động của chính agent đáp một vị từ, do hệ thống
đánh giá, không có cuộc trò chuyện nào.**

Hai cơ chế bảng nữa (`圣魔之血`, chính thức): **天之徽记 là vé vào cổng vật lý** — 5/ngày
từ NPC, nhiệm vụ tím **trả lại một vé**. **Bảng tự trả chi phí vào cửa ở bậc trên cùng.**
Và bảng **làm mới khi hoàn thành, theo từng người chơi** — nguồn việc là hàm của thông
lượng của đàn, **không có vòi NPC nào**. Một kinh tế tự điều tiết.

**Phải đưa vào danger list:** một nhiệm vụ `圣魔之血` đòi **hai người chơi, hai giới tính
khác nhau, đã kết bạn lẫn nhau** — co-op bị khoá bởi **tiền trạng quan hệ xã hội**. Bản tổng
hợp cấm mặc cả tự do và gọi 心魔 lockout của 诛仙, nhưng **quan hệ-khoá cơ phối hợp phổ biến
hơn nhiều và hỏng với agent nhiều hơn nhiều**.

Và một nguyên thủy tranh chấp mà bản tổng hợp không có: nhiệm vụ 魔树 **gieo một hạt phải
chạm cứ 2 phút, mỗi giai đoạn chỉ sống 3 phút nếu không ai chăm, và lúc kết quả thì ai
cũng cướp được**. **Công việc có đồng hồ, bỏ mặc, lộ ra toàn thế giới, và bị cướp giữa
chừng.** Không mặc cả, không tin, không scalar — tranh chấp thuần trên một đồng hồ công khai.

##### 职业分工 — thể loại đã có câu trả lời cho bài khó nhất của tôi

`打工修仙记` (chính thức): **副职业 = 炼丹 / 炼器 / 布阵 / 制符 / 烹饪**, mỗi cái 9 phẩm,
**khóa chéo tường minh** — 烹饪 **tiêu** 制符 cùng phẩm; 炼er là **tiền đề cho tỉ lệ thành
công của mọi phụ nghề khác**; 炼丹 lấy nguyên liệu từ **灵田 của chính bạn**. Và **体质
可以同时存在多个，但是只能生效一个**; chỉ có được từ **秘境宝库100积分**.

`极光世界` (chính thức): **丹修 / 术修 / 剑修 / 巫修**, mỗi cái có danh hiệu thợ
(丹士/方士/侠士/巫士), và câu quyết định:

> 「**丹士并不追求法力上的强大，因此永远不会有天劫之忧**」
> 「**丹士们可以长生不老**」

⇒ **Tử thôn là thuộc tính của một con đường, không phải ngưỡng phải vượt.** Một 丹修 không
bao giờ gặp. Đây là cách giải **không-scalar** đã **ship, chính thức**, cho đúng câu hỏi mà
bản tổng hợp khẳng định *"the genre has most consistently got this wrong"*.

`诛仙2` (chính thức): 12 nghề nghiệp; 道无为学府 **不以提升战力为导向**; 仙枢师 tùy biến 法宝
theo **资质** của người mang.

`修仙家族模拟器` 的百艺: 「炼器，炼丹，炼符，**傀儡**，培育灵兽，阵法，种植，**采矿**」.
**傀儡 (puppets) và 采矿 xuất hiện ở đâu cả trong bản tổng hợp.** Puppets là **đơn vị tự
trị bạn chỉ huy thay vì thương lượng** — có lẽ là vật thể **hợp agent nhất** trong thể loại,
và hoàn toàn chưa ai quét.

#### 1.13 ĐẢO — Điều bản tổng hợp hỏi mà không ai hỏi

> **Khi một agent chết, nó còn sở hữu cái gì?**

Trong một thế giới nhiều agent bền vững, **death handler chính là phễu cân bằng vòi phun**.
Và **không ràng buộc thiết kế nào trong tài liệu nhắc tới nó.** Đây là lỗ hổng đơn lớn nhất.

Hai câu trả lời tốt hơn, đều chưa ai quét: `修仙家族模拟器` 的魂莲台 — mỗi đệ tử hồi sinh
**một lần**, từ **1岁炼气一层**, **không cảnh giới, không kỹ thuật, không trang bị, không
hành trang**, với **xem trước xác định** (20% → 100%). Và **老祖转世 có độ trễ quay lại
ngẫu nhiên 30–100 năm** — bạn không hồi sinh, bạn hồi sinh **vào một ngày tương lai ngẫu nhiên**.

#### 1.14 VỠ — Ba phát biểu tự tin hơn bằng chứng

1. **"Cơ chế duy nhất trong corpus thỏa mọi ràng buộc LLM cùng lúc"** (cửa sổ yếu 5 năm /
   5 ngày). Bản tổng hợp biết nó dựa trên một chương của một tiểu thuyết — nó nói vậy
   trong danh sách chưa giải quyết. Không sai khi để ở đó. **Sai khi nó là slot thiết kế
   hạng nhất kèm bài luận "vì sao không ai làm".** Hoặc tìm tác phẩm thứ hai và thứ ba,
   hoặc hạ xuống.
2. **"Thể loại nhất quán sai chuyện tử thôn"** — `了不起的修仙模拟器` ship một tử thôn
   **phán bằng karma và địa hình, qua ba con đường, với công thức bậc được công bố**. Một
   phản ví dụ không làm *"most consistently"* thành sai, nhưng làm câu **không đứng được
   khi viết**.
3. **Các trích dẫn LLM** — mục 1.4.

---


> *"Phần lớn nó sống sót. Bốn thứ thì không. Và lỗ hổng lớn nhất là cái mà khuyến nghị
> chính của tài liệu phụ thuộc vào."*

#### 2.1 VỠ — Toàn bộ cái giá của khuyến nghị chính nằm trên hệ thống không ai quét

Câu một dòng của bản tổng hợp: **một cảnh giới lớn nên mua QUYỀN, không phải một số lớn
hơn**. Mục openDesignSpace thừa nhận hoá đơn: *"if nothing scales, encounters must scale,
and the encounter table becomes the whole game."*

**Bảng encounter không có trong tài liệu.** Không mục itemTree nào về combat, enemy hay
encounter. **statModel 20 mục chứa không một chỉ số chiến đấu** — không công, không phòng thủ,
không chí mạng, không né, không bể chỉ số hồi phục, không hồi chiêu. Đợt này nêu "combat" và
"enemies" là trong phạm vi. **Chúng không được quét.**

⇒ Tài liệu đưa ra một phát minh mà tính khả thi của nó **hoàn toàn nằm trên một hệ thống nó
không có bằng chứng nào** — và không nhận ra đó là vấn đề. **Đó là phát hiện. Phần còn lại là
phụ.**

#### 2.2 BẮC — Chiến đấu vắng mặt, và thể loại **đã giải xong** ràng buộc của dự án trong đó

Bốn cấu trúc lượt đã ship, **không cái nào xuất hiện trong bản tổng hợp**:

| Nguồn | Cấu trúc | Vì sao quan trọng |
|---|---|---|
| **指尖修仙 (2017)** | 回合制, **trần 60 lượt**, phán đoán: 「60回合以内击杀则胜利，否则失败」 và 「60回合后如果没有死亡方，则**防守者胜利**，挑战者失败」 | Không có giây. **Ha mòn về phía bên phòng thủ**, không về phía mạnh hơn |
| **无极仙途 (2024)** | 「共30回合，30回合内没打死对面算**进攻方输**」 | Cùng hình dạng, trần khác |
| **一起来修仙** | Tốc độ quyết định thứ tự; **当一方速度领先约10%时必定先手**; buff **đếm theo lượt, không theo hành động**, bất kể ai hành động; **宠物 luôn ưu tiên trước lượt người chơi** — tốc độ pet là chỉ số chết vì luật đã cắt nó | |
| **剑侠情缘95 (2001)** | Bậc trật tự là thuộc tính **cả đội**: `团队总加权身法 = Σ(身法_i × rnd(0.9,1.1) × 行动系数)`, 行动系数 合击 10 / 防御 5 / 治疗 3 / 加速 3 / 逃跑 2 / 攻击 1, và **mọi hành động của địch đều có 行动系数 = 1** | **5 nhân vật yếu thắng 1 nhân vật mạnh** trên bậc trật tự, và **nhân vật không đọc được bậc trật tự của chính mình** từ sức mạnh của chính mình |

Bằng chứng về đơn vị lượt của toàn bộ bản tổng hợp là **một con số** (100 道力 mỗi trận của
鬼谷八荒), nằm chôn trong một đoạn thiết kế chứ không phải trong chất nền.

⇒ **Câu trả lời của thể loại cho "không có giây trong kinh tế" không phải một loại tiền — nó
là một trần lượt cứng, được bảo vệ, và bên phòng thủ thắng khi hòa.** Nó đã ship hai mươi
năm. Đó là một bài toán **lập lịch** — đúng loại bài agent giỏi.

**Cơ chế đơn vị lượng tốt nhất bị bỏ trong toàn bộ chất nền: khối lượt.** Chế độ thủ công của
`指尖修仙`: **每6个回合为一轮**, và màn xếp thứ tự xuất hiện **đầu trận và cuối mỗi khối 6
lượt**. Ngân sách lập kế hoạch **hữu hạn, đơn vị lượt, có điểm quyết định định kỳ** — và có
**giới hạn đồng hồ chờ sau đó game tự chọn**: một hazard phản xạ có **mặc định an toàn được
thiết kế sẵn**, đã ship.

**Và hazard micromanagement bản tổng hợp nhắm sai mục tiêu.** Ràng buộc "no micromanagement
surface" được dẫn chứng bằng bộ tạo mặt 48 xương của NetEase — đó là **một bài báo game về
UI console**. Trường hợp đúng đề tài là `无极仙途`: **6 人物招式 (trong 100+) + 5 灵兽招式
(trong 100+) + 10 本命神通 + 2 天赋 + 本命飞剑 + 5 法则 ≈ 28 ô cấu hình tay, phải điều chỉnh
lại theo từng đối thủ**, với tương tác thứ tự ra lệnh và hồi chiêu. Một game tu tiên năm
2024, đúng thể loại, và về mặt cấu trúc **tệ hơn nhiều**.

#### 2.3 BẮC — Cái scalar 境界 được cài vào **turn loop**, và không ai viết ra

- `修个什么仙`: **出手顺序 so 境界＞灵巧 trước**, chỉ khi bằng mới xét 灵巧
- `修仙家族模拟器2`: **神识 ảnh hưởng 战斗出手顺序**

⇒ Trong một lớp game tu tiên RPG đã ship đáng kể, **境界 là một scalar sức mạnh chiến đấu**
— đúng thứ luật repo cấm — **được cài qua thứ tự lượt chứ không qua nhân sát thương**.

Bản tổng hợp xếp 境界 là `escapesScalar:false` với lý do *"境界压制 IS the scalar wearing a
costume"* rồi **không đi theo hệ quả**: thể loại không chỉ chấp nhận nó, nó **cắm cái thang
vào vòng lượt** — và `剑侠情缘` cho thấy nó **đã bị gỡ có chủ đ giữa 2001 và 2024**.

**Câu xu hướng đó là câu có giá trị nhất trong toàn bộ đợt 2, và nó không nằm trong bản tổng
hợp.**

Cùng game đó còn ship **以静制动: 我方越慢，伤害加成倍率越高** — một chỉ số chiến đấu
**không đơn điệu**, đã ship, không ai nhắc.

#### 2.4 ĐẢO — `乘区` và công thức sát thương: hệ thống lớn nhất bị bỏ, và nó **bác bỏ** mục "bounded properties"

Bản tổng hợp nói bounded = **clamp** (80% / 25% / 50% / 95%). **Sai.** Đã ship:

- **铸仙之境** — tám 乘区 có tên, công thức đầy đủ, và
  **`暴击率 = log₂(暴击等级/抗暴等级)/4`**: bị chặn **ở cả hai đầu bằng cấu trúc** — ≤1×
  không bao giờ chí mạng, 2× = 25%, 4× = 50%, 8× = 75%, 16× = chắc chắn. **Một hàm log là
  câu trả lời cho lạm phát số tốt hơn hẳn một cái trần**, và bản tổng hợp chưa từng thấy một
  chỉ số **bị chặn bằng cấu trúc**.
- **我的勇者** — chuyển đổi chí mạng là **ba đoạn**: `<200 → 值/400`; `200–500 → (值×17)/6000
  − 值²/600000` (**bậc hai**); `≥500 → 值/500`; rồi ×(1+%) − kháng, trần 100%, và **phần
  tràn bị vứt** (「溢出暴击率的部分没用的哦」). **Hình dạng của đường cong là thiết kế.**
- **仙境传说RO** — công thức khắc phục hệ sinh: `元素结算 = 1 − x − 0.3(1 − sin(xπ/2)) − 0.2`,
  với các điểm bão hoà đã công bố (58,9% khắc hệ → giảm tối đa 85%; 83,6% chủng tộc; 69,8%
  vật lý; 94,4% phép thuật). Và **tại x = 0 hệ số là 0,5 chứ không phải 1,0** — một trận
  hoàn toàn trung tính đánh **một nửa sát thương**. Phòng thủ là `1/(1 + 6·def/atk)` và game
  **lấy công thức nào có lợi cho kẻ tấn công**
- **修仙家族模拟器2** (bài trên diện độ nhà phát triển, 2025) — công bố bảng chuyển đổi chỉ
  số **và chỗ chế độ đảo chiều**: 攻击 1% ≥ 伤害 1%; 穿透 1% = 0.25% 攻击; 增伤 1% = 0.75%
  攻击; 暴率 1% = 增伤 1.5%; 常驻防御 ≈ 攻击/4. Rồi: **攻击 ≥125% thì 增伤 lợi hơn attack;
  ≥58% thì 暴击率 lợi hơn; ≥80% + 暴击率 65% thì 暴伤 lợi hơn 暴伤**. Đó là **điểm uốn định
  danh build được công bố**. Ngoài ra: 伤害浮动 ±10%, và **增益不锁面板** — buff đi thẳng
  vào sát thương cuối, **bảng chỉ số nói dối có chủ đích**

**Cái cuối là câu trả lời thật cho bài toán chống scalar, và bản tổng hợp bỏ lỡ: một chỉ
số mà bảng hiện ra không phải chỉ số đánh nhau.** Với người chơi là LLM, đây **hoặc** là thuộc
tính đáng giá nhất bạn có thể ship, **hoặc** là cái bẫy chết người về khả năng đọc. Tài liệu
không có lập trường nào.

#### 2.5 BẮC — Năm claim sai hoặc ngược, kèm nguồn

**1. "梦幻西游 một mình" về cấu trúc khắc phục — sai, và ví dụ thật tốt hơn.** Wiki chính
thức NetEase 大话西游2 công bố
`强克 = (1+己方强克+对方被克属性) × [1 + (己方克对方×对方被克 − 己方被克×对方克己方)] × 40%`,
với điểm giao **tổng khắc 178** nơi **phân tán thắng trục đơn**, và quy tắc rõ ràng **五行相克
một chiều**: bị khắc không tốn giảm nào. ACS công bố `风水值 = P_目标 + 2·P_生目标 −
2·P_克目标`. RO công bố đường cong sin. **Ba hệ ngũ hành đã ship với công thức đã công bố,
không scalar, hình dạng vector.** Bản tổng hợp xếp mạnh nhất vào ONE_GAME.

**2. "Không game tu tiên nào có kết cục chiến đấu không chết thật" — sai ngay trong corpus của
nó.** `修仙家族模拟器2` 的**心魔劫** có **hai** cách kết thúc: giết nhanh, **hoặc sống sót
năm phút** — và chứa **bản sao nhân vật phái sinh từ chỉ số của chính bạn** (「心魔有个你自己
复制体，你越强他越强…他的面板属性默认为你的几倍」), nơi lượt chơi tối ưu là **bỏ hết kỹ năng công
kích**. **雷劫** là một trận sống sót thời gian thực năm phút **không có tùy chọn giết**.
Bản tổng hợp trích game này ở chín field và **không một lần** nhắc hai điều đó.

**3. "Thất bại không phá hủy là điều live-service không dám làm" — 雷劫 phủ nhận.** 雷劫
**hủy vĩnh viễn trang bị**: 耐久上限 về 0, 「**装备破碎无法修复**」, và hướng dẫn bảo mang **bộ
dự phòng** vì bộ chính có thể không sống sót. Danger list của bản tổng hợp dành một mục cho
hazard phá hủy, dùng `诛仙` 佩章 làm bằng chứng thể loại thủ thủ, và **không kiểm tra chính
game trụ cột của nó**.

**4. 寿元 như đồng hồ lượt chạy — game cung cấp công tắc TẮT nó.** `修仙家族模拟器2` có hai
chế độ chọn lúc tạo nhân vật: **修仙模式** (chết chỉ tốn 元气, tu luyện đình trệ) và **真仙模式**
(chết, 修为归零, chơi lại). Một công tắc người chơi về việc đồng hồ lượt chạy có tồn tại hay
không, **thú vị hơn chính cái đồng hồ**.

**5. "Đúng một game đã thử" — tần suất nền không đứng được.** Mọi "đúng một" trong tài liệu
nghĩa là *"đúng một trong ~15 game mà ai đó tìm thấy wiki"*. Cái duy nhất được kiểm toán
(`ACS 品阶`) **đã sai và sinh ba artefact dẻ xuống** — tài liệu tự nói vậy rồi không tổng quát
hoá sang **mười một negative chưa kiểm toán**, và critic đã **đảo ngược năm cái**.

#### 2.6 ĐẢO — "Đấu tranh không đều" của 梦幻西游 không đều, và đó mới là điểm thú vị

Tài liệu khẳng định *"regular only over NINE vertices"* rồi **ngay câu sau** liệt kê
out-degree **3,4,3,4,3,4,3,4**. Một giải đấu đều trên 9 đỉnh có mọi out-degree bằng nhau. Xen
kẽ 3/4 là **giải đấu không đều** — nghĩa là **không mảng nào đứng ngang nhau**.

Tài liệu **phát biểu tính chất rồi bác bỏ nó trong cùng một câu**, rồi dựng kết luận "nó luôn
trả lời ai mạnh hơn" lên trên đó.

#### 2.7 ĐẢO — `双重方案` sống sót, và chi tiết sống sót **đảo ngược** một kết luận

Nó là first-party (tài khoản nhà phát triển TapTap). Nhưng tài liệu gọi hai nhánh là
"equal-status". **Không phải.** Nhánh roll là nhánh **giảm tải cho người chơi** (「为了降低
大家的负担，我们可以直接跳过玩法」), và dưới nhánh đó **肉身关不展示啦** — xác suất được công bố
bị **ẩn đi ở một trong ba cổng**.

⇒ **Mức độ tiết lộ thông tin phụ thuộc nhánh, theo lựa chọn của designer.** Đó là một cơ chế
hay hơn nhiều so với cách đóng khung "ngang hàng", và cách đóng khung của tài liệu làm mất
nó.

#### 2.8 BẮC — Câu hỏi thực nghiệm nặng nhất **đã có đáp án**, và nó cắt ngang lập luận của bản tổng hợp

Bản tổng hợp gọi *"LLM có so sánh vector chỉ số đáng tin như so sánh số nguyên không"* là
**"the load-bearing empirical question under the whole no-scalar rule"**. **Nó không chưa giải.**

- **LISTEN (arXiv 2510.25799, IJCAI-ECAI 2026)** đã chạy đúng phép thử đó: xếp hạng của người
  làm ground truth, đối chiếu bộ chấm z-score tất định, LLM xếp hạng một lượt, và LLM so
  sánh theo khối. Kết quả: **bộ tổng hợp LLM bằng hoặc vượt baseline tiện ích tuyến tính**,
  và phần cải thiện của nó so với "xếp hạng LLM thô toàn bộ danh sách" đến từ **tách theo kích
  thước ngữ cảnh, không phải theo số thuộc tính**.
- **DecompR (arXiv 2605.26878)** là phát hiện quan trọng với ta và **không có trong tài liệu**:
  *"Holistic LLM judges conflate utility estimation and utility aggregation, yielding unstable
  implicit weights… these weight-induced shifts also increase with stakeholder count."* Yêu
  cầu LLM xếp hạng theo nhiều tiêu chí cạnh tranh sinh ra **trôi trọng số**, và **độ trôi tăng
  theo số tiêu chí**. Cách sửa là **cố định trọng số trước khi chấm**, không để mô hình tự chọn
  ngầm.

**Hai hệ quả, và cái thứ hai đáng giá nhất:**

1. **Luật cấm scalar là một tuyên bố về HỆ THỐNG, không phải về NHẬN THỨC.** Luật trong repo
   nói: *một khi con số tồn tại, mọi hệ khác âm thầm trở thành hàm của nó* — đó là nói về **nhà
   thiết kế** dựng gì. Agent có gộp được vector lúc chơi hay không là một câu khác, và tài
   liệu nói **agent làm được**. **Bản tổng hợp bảo vệ một lập luận khác với lý do của nó.**
2. **Bảng xếp hạng mà bản tổng hợp đề xuất là ca tệ nhất đã công bố.** *"A leaderboard whose
   entry is a SET rather than a number, a reward curve that pays for the set's composition
   rather than its total"* — chính xác là ca nhiều bên tiêu chí mà DecompR nói sẽ trôi. Nó
   được đề xuất **mà không kiểm tra LLM có xếp hạng nó ổn định hay không**. **Không ổn định,
   trừ khi trọng số được công bố và cố định** — cùng cách sửa mà các bài 乘区 dùng.

#### 2.9 BẮC — Một meta-scalar mà game trụ cột của tài liệu ship, không ai nhắc

**功德** (điểm tài năng) vắng mặt khỏi toàn bộ tài liệu. 局外功德 **chỉ kiếm được khi 转生**,
tính theo cảnh giới, và **nhân đôi mỗi cảnh giới lớn**: 练气 +1/层 → 筑基 +2 → 金丹 +4. Nó
mua **灵根** (五灵 0 / 伪 2 / 三 5 / 双 10 / 单 20 / 天 80) và mọi tài năng.

**Hai vòng lặp nhân đôi lồng nhau xuyên nhiều thế hệ.**

Phán đoán mạnh nhất của tài liệu là 寿元 như một đồng hồ lượt chạy không-scalar, lấy từ một
game mà **tiến trình ngoài trò chơi là một ngân sách điểm nhân đôi mua phân bố thiên tài
cố hữu của nhân vật**. **Không ai hoà giải hai điều đó.**

#### 2.10 BẮC — Thiếu nguồn bản đầu, và mẫu chọn có thiên lệch

> **Không một nguồn bản đầu nào trong toàn bộ tài liệu**, ngoài hai bài TapTap mà critic tìm
> ra. Không dev blog, không GDC talk, không 设计师访谈, không patch note, không ảnh tooltip
> trong game.

Mỗi claim về **"vì sao chưa ai làm"** — *đầu ra trung tâm của tài liệu* — đều lấy từ wiki và
trang hướng dẫn. Với một tài liệu có luận điểm *"chưa ai làm, và đây là vì say"*, đó là **sai
lớp bằng chứng cho toàn bộ câu hỏi**.

Và: `修仙家族模拟器2` chiếm **~40% bằng chứng chịu tải**, và là **MMO mobile 2D, ba người,
ít ngân sách** (chính nhà phát triển: 「我们目前还是几个人的小团队开发，并且没有太多资金，
因此次全游戏只能是2D画面」), được sweep vào **vì nó có wiki**. **Nó là game có tài liệu tốt
nhất đúng vì lý do nó ít đại diện nhất.**

Tương tự: `觅长生` 的修为 rate **không có đơn vị thời gian và sai số nội bộ 171×** — mục
chưa giải quyết của chính tài liệu — rồi tài liệu **dẫn game đó cho claim chính** và còn
sáu lần nữa, kể cả bảng nguyên liệu chế tạo "tốt nhất corpus" mà cửa sổ chế tạo của nó tính
bằng **ngày**. `鬼谷八荒` mang bốn claim chịu tải và **đã bị đọc sai một lần rồi** (lỗi thang
30 bậc). `太吾绘卷` được mô hình hoá từ hướng dẫn early-access, **bản 正式版 chưa từng được
đọc**.

**Và `Nature 2025` được dùng bốn lần như một ràng buộc cứng**, nhưng nó nói về Trò chơi Nhân
tài lặp lại trong thí nghiệm có kiểm soát; **nhân nó lên một thế giới 50 agent bền vững là một
bước nhảy loại** mà tài liệu không gắn cờ.

#### 2.11 ĐẢO — Một "đúng không" nữa, lần này mang tính quyết định

`灵根` trong `觅长生` **không phải scalar** — nó là **vector trọng số**: 伪灵根 = 20% mỗi hệ;
天灵根-金 = 33,33% Kim và 16,67% mỗi hệ khác. Bản tổng hợp ghi nó là `isScalarRisk: false` vì
chỉ "a weight VECTOR". Đúng — nhưng rủi ro scalar **không nằm ở cách nó vẽ, mà ở cái nhân
tốc độ tu luyện gắn vào đỉnh nó**: **天灵根 = 2–3× tốc độ tu luyện**, và nguồn thống nhất cho
thấy đó là một hằng số nhân tuyến tính trên chính cái vector.

Còn `道心` mới là cái thoát thật, và nó **đã ship**: **`道心` reset về 0 mỗi lần thăng cảnh
giới**, được nâng bằng sự kiện trong cảnh giới, và ở 100 thì các cổng 神识关 **tự động qua
hoàn toàn**. Không bao giờ qua được nếu bạn không có điểm; **luôn qua được nếu bạn đã xây
đủ trong cảnh giới**. Một điều kiện **không so sánh được giữa hai người**, bởi nó không sống
sang cảnh giới sau.

#### 2.12 ĐẢO — Percentile stacking chưa được gọi tên

`剑侠奇缘`: mỗi điểm kinh mạch hoàn thành cho phần trăm, và hướng dẫn khuyên **trì hoãn
điểm cuối**. Một chỉ số là phần trăm của phần trăm là cách dựng lại scalar từ bốn cái nhỏ.
Tài liệu có luật này cho 寿元 và 战力, **không có cho việc cộng dồn vật phẩm/kinh mạch**.

#### 2.13 THỪA — Đánh giá bằng chứng sai loại

`资` trộn ba đường cơ sở trong một ghi chú. **Trường `isScalarRisk` không bảo vệ được như
đã gán**: 悟道点 đánh dấu `false` vì quyết định nó tài trợ là "topological rather than
volumetric" — cùng lập luận sẽ xóa 战力, trên một tổng đi từ 83 lên 98–108.

**Bốn mục itemTree mang nhãn lai** ("GENRE_CANON noun, ONE_GAME every implementation" ×3)
trong khi brief đòi **đúng một** nhãn. **Mọi nhãn lai nằm trên một mục mà `ourOpportunity`
của nó là "chưa ai làm".** Nếu danh từ là canon và mọi hiện thực là của một studio, nhãn
trung thực là ONE_GAME và **claim mới chết cùng nó**.

**Không game nào ngoài Trung Quốc xuất hiện** trong itemTree, levelModel hay statModel — dù
tài liệu tự gọi tên WoW và Dark Souls trong mục chưa giải quyết và thừa nhận quét nông. Với
một brief "game gốc" mà điểm khác biệt duy nhất là thiết kế chống scalar, **thân thể hệ
thống RPG đã ship được năm mươi năm mà không có power score chính là chỗ nên đọc** — và nó
không được đọc.

---


> **Đợt 3 đã bị một critic đánh giá là đóng ĐÚNG HAI LỖ HỔNG MÀ NÓ ĐƯỢC GIAO.**
> Một nửa, với một lý do mà nó tự thừa nhận.

#### 3.0 BẮC — Bằng chứng của đợt 3 không có trong repo, và không ai tái tạo được

Critic mở `docs/dao-lu/.research/2026-09-30/` và tìm thấy **hai** tệp của hai đợt trước.
**Không có report domain nào, không có skeptic nào, không có audit nào.**

> **"Tổng hợp là một văn bản mồ côi tồn tại ở đâu đó ngoài kho."**

Và nghiêm trọng hơn: critic **không thể tái tạo** 3 trong 4 calibration case, **vì các phần bác
bỏ không nằm trong repo** — "không phải thất bại của tìm kiếm của tôi; đó là vấn đề bằng chứng
mồ côi, lặp lại trong đúng một mục mà toàn bộ giá trị của nó nằm ở chỗ được hiệu chuẩn."

Đây chính là `AGENTS.md` nói: *"A gate that cannot fail is worse than no gate."* Một tổng hợp mà
không mở được ra để kiểm thì không thể kiểm, và đợt sau sẽ coi nó là đã chốt.

**Đã sửa** (xem `OPEN-QUESTIONS.md` §7): `.research/2026-09-30/` nay có bốn tệp, và
`CALIBRATION-DISPROOFS.md` là đối chứng cho mọi audit negative sau này.

#### 3.1 BẮC — Trích dẫn chính cho câu trả lời trung tâm sai một nửa

Đợt 3 viết: *"寻道大千's 真实伤害 (six named skills) **and 灵兽** ignore 防御 entirely **and
both skip 增伤/减伤**."*

Nguyên văn công thức:

```
灵兽技能伤害 = 最终攻击力 ×(1+鼓舞)×(1−压制)×(1+强灵−弱灵)×(我方实际增伤 − 目标实际减伤)×灵兽技能值
```

⇒ **灵兽 bỏ qua 防御, nhưng TIÊU 增伤/减伤.** Đơn vị bỏ qua `防御` **và** giữ 增伤/减伤 là
**精怪**: 「精怪的伤害无视目标防御力。受增减伤、破甲格挡属性影响。」

Đợt 3 **gộp ba hệ con khác nhau** (精怪 / 宠物 / 灵兽) vào **đúng một câu** mang câu trả lời của
thể loại cho `境界碾压`.

Và tệ hơn: biểu thức nền thật của game là

```
非暴击人物伤害 = (最终攻击力 − 目标最终防御力) × (1 + 我方实际增伤 − 目标实际减伤) × (1 + 鬼将值)
```

— **đúng là difference-of-aggregates**, mà chính `scalarEnforcement` #1 của đợt 3 gọi là
*"hình dạng phổ biến nhất và khó đọc nhất"*, **và nó đặt `寻道大千` lên đầu tiên**. Đợt 3 đề
xuất cơ chế bounded-difference của game đó mà **không nói rõ nó nằm bên trong biểu thức mà
chính đợt 3 kết án.** Với một thiết kế mới luận điểm là **hình dạng của biểu thức mới quan
trọng**, đó là nửa sai của đúng cái tên đó.

#### 3.2 BẮC — Số của thiết bị trung tâm là content farm, và có dấu hiệu trộn

Đợt 3 đưa ra năm dải độ khó của `觅长生` như **"CÂU TRẢ LỜI"**, với số:
极简 (+5 lá bài/lượt, −50% sát thương), 简单 (+2, −20%), 困难 (+20% nhận, −20% phát),
极难 (+50% nhận, −50% phát).

**Nguồn duy nhất tìm được là 游民星空 — in lại NGUYÊN VĂN bởi 9game, 老友网 và TapTap**,
một nguồn content farm mặc bốn mũ, **cùng lỗi chính tả giống hệt**.

- **Hướng và chiều của 极难 và 极简: đúng.**
- **极简 "+5 lá bài/lượt": không có con số nào trong bất kỳ nguồn nào.** Nguồn nói "tăng hấp thụ
  linh khí", không định lượng.
- **Số của 简单 và 困难: không xuất hiện trong nguồn nào tôi tìm tới.**

Và có bằng chứng dương của việc trộn: **số lá bài thật trong `觅长生` là theo CẢNH GIỚI và theo
功法** — 「练气初始4卡…筑基5卡…金丹6卡…但是有功法会和你第一回合的卡数量相关，比如凌云决（初始多抽
1~3卡）」. Các con số `+1/+2/+3` mà đợt 3 gán cho dải độ khó **thuộc bảng cảnh giới và bảng
功法**.

⇒ Thiết bị **sống** — năm dải điều biến sát thương nhận/phát, đọc được trước khi cam kết,
**là thật và đúng hình dạng**. **Các con số gắn vào nó thì không.**

#### 3.3 ĐẢO — "Không studio nào nói" là sai, và slot #4 là lỗ hổng tài liệu chứ không phải thiết kế

Đợt 3 viết: *"原神 multiplies 减防×无视防御; 崩坏 adds them. Two studios, opposite rules,
neither stated. That is a free, shippable transparency win nobody has taken."*

Quy tắc được nói **rõ, đối chiếu, và từ năm 2023**:

> 「在原神中，减防与无视防御**乘算**，相互稀释，而在星穹铁道中，减防与无视防御**加算**，相互反稀释」

Và luật riêng của 原神 nằm trên HoYoLAB: 「**穿防属性与怪物的最终防御力乘算**」.

⇒ Claim đúng phải hẹp lại: **không studio nào hiện quy tắc này TRONG GAME; nó chỉ tồn tại
trong wiki cộng đồng.** Và đó là **một thắng lợi tài liệu**, không phải một khoảng trống thiết
kế. Lý do "chưa ai lấy" của đợt 3 — *"kỹ thuật: quy tắc rơi ra từ thứ tự engine" — **sai** ở
cùng hướng với phần còn lại: quy tắc rẻ để nói và đã được biết, nên nó **không mới và không bị
chặn**.

**Một thiếu sót liên quan làm đổi khuyến nghị**: mô hình kháng của 星铁 chỉ an toàn vì
**không có quái nào trên 75% kháng và không có kháng âm**. Đợt 3 đưa nó ra như sao chép được mà
không kèm **điều kiện cho phép** đó. Chép công thức mà bỏ điều kiện là **ship một vách tại
75%**.

#### 3.4 ĐẢO — Nhầm hai mức suy giảm

Đợt 3 viết: *"bản 50/30/10 đọc thứ hạng và bỏ qua độ lớn — thứ tự duy nhất; bản 8.0 là hàm
mũ không chặn."*

**Cả hai đều là thứ tự.** Cả hai là hàm của **chỉ số cảnh giới** và không gì khác. 50/30/10 là
thang ba bước **có chặn**; 0,5ⁿ là hình học **không chặn**; không cái nào đọc độ lớn. Đối lập
thật là **chặn/không chặn**, không phải "thứ tự/không".

Bằng chứng đều chính thức:

> 「相差一个大境界攻击，伤害直接减半，相差2个大境界，伤害只有30%，3个大境界伤害只有10%」
> 「攻击者每高一个大境界，就会自动忽视一半的对应效果…筑基期攻击，炼气期就只生效50%，紫府期则只生效25%」

#### 3.5 BẮC — Công thức của `弈仙牌` đã bị sửa mà đợt 3 không ghi ngày

Đợt 3 xếp `弈仙牌` là **"chi phí máy thấp nhất… duy nhất được công bố trọn vẹn"**. "Công bố trọn
vẹn" thì đúng. **"Ổn định công bố" thì không.**

| | FAQ chính thức 2024-01-25 | FAQ chính thức 2026-06-09 |
|---|---|---|
| 命元, gap ≤ 20 | 轮次数 + **0** + 差/5 | 轮次数 + **1** + 差/5 |
| 命元, gap > 20 | 轮次数 + **4** + (差−20)/10 | 轮次数 + **5** + (差−20)/10 |

Slope, trần và điểm gấp khúc giữ nguyên. **Hằng số dịch.** Đợt 3 nêu chúng **không ngày** —
trong một tài liệu mà luật nêu là mọi con số phải mang đơn vị và mẫu số.

Và phán quyết "chi phí máy thấp nhất" bỏ sót điều mà wiki chính thức nói thẳng: **修为 ở đó là
MỘT con số làm BA việc** — nó đặt 先手, nó **chặn các bước cảnh giới** (9/21/36/55 修为 →
筑基/金丹/元婴/化神), và nó định cỡ bộ bài. **Đó đúng là chế độ thất bại của luật repo, trong
đúng cái tên mà đợt 3 dùng làm ví dụ sạch nhất.**

#### 3.6 ĐẢO — Audit: 46% không trả lời, và cách nó tự kết luận không đứng

Đợt 3 gọi **6 INCONCLUSIVE trên 13** là "đảo ngược tri thức" và nói số sót **yếu hơn** số gục.

**Suy luận đó không có.** Tái tạo bốn positives đã biết chứng minh **tìm kiếm có khả năng tìm
thấy positives**, không phải một kết quả rỗng là bằng chứng yếu. Mệnh đề bảo vệ được là hẹp
hơn nhiều:

> *Một negative sống sót qua một lần tìm kiếm **mà lần tìm kiếm đó cũng tìm ra bốn cái
> biết-đúng** mạnh hơn một negative sống sót qua một lần tìm kiếm **không tìm ra gì**.*

Và cơ chế có **vòng tròn** mà đợt 3 không gọi tên: **tìm kiếm được chọn bởi chính các negative
nó đang kiểm tra.** Tìm được C1–C4 chứng minh audit đã nhìn vào nơi mục tiêu của nó nằm —
**không** chứng minh nó đã nhìn vào nơi một negative chưa liệt kê sẽ nằm.

**Một nhãn sai:** đợt 3 gắn nhãn **"first-party (studio blogs)"** cho `ACS 品阶浮动`. Trang bwiki
đó mang 「数据仅作参考」 ngay trên bảng mà công thức được đọc ra, và devlog của studio chỉ nói
định tính. **Đó là số học của hướng dẫn.** Nhãn sai **theo hướng ngược lại** với tự phê bình
gay gắt nhất của chính audit (*"tỉ lệ chính thức trung thực là khoảng một phần ba"*) — tức audit
**đánh giả mức độ khắc kỷ của chính mình**.

#### 3.7 Những gì đợt 3 làm đúng mà các đợt trước không làm

Ba cái, và không cái nào nhỏ:

1. **Sửa tiền đề là thật và được thu hẹp đúng.** *"No damage multiplier"* thì sai; **"no
   **realm** multiplier"** thì đúng. `觅长生` **có** các vùng nhân (×1,25, ×1,18→×1,90 theo
   chồng, ×4 chí mạng, thanh toán tuần tự) và **không** có hệ số theo cảnh giới. Đó là một
   sửa chữa thật cho claim của đợt 2 trong `RPG-SUBSTRATE.md`.
2. **Đường vòng loại sát thương có tải và không chỉnh được**, và bằng chứng là **một mod năm
   2026 tồn tại chính là để THÊM 境界压制**. Một cộng đồng viết cái cơ chế mà studio không cân
   nhắc là đã đóng — đó là bằng chứng mạnh nhất có sẵn rằng thiết kế đã trả lời một câu hỏi mà
   studio tưởng đã xong.
3. **Câu trả lời ba thiết bị đúng về cấu trúc, và bất đối xứng phần thưởng là điều đáng sợ
   nhất.** *"Một trận đấu có thể không scalar; phần thưởng thì không, vì độ hiếm là một thứ tự"*
   là **câu nhọn nhất của cả chuỗi**, và không gì tôi tìm thấy mâu thuẫn với nó.

---


1. **"Đúng một" là tần suất mẫu, không phải tần suất thế giới.** Đã kiểm toán một negative,
   nó sai, và nó sinh ba artefact. Mười một cái còn lại **chưa kiểm chứng**.
2. **Nguồn bịa trong ngữ pháp đo lường hoàn hảo** là loại nguy hiểm nhất, vì nó lọt qua mọi
   kiểm tra hình thức. Bốn truy vấn rõ ràng nhất trả về bốn trang bịa.
3. **Một claim đúng xuất hiện một lần trong nước bẩn và một lần trong wiki thật** — và nếu
   trích cẩu thảo, nó trông đáng nghi. Báo cáo wiki, vứt nước bẩn, **ghi rõ cả hai**.
4. **Trích một diễn đàn và gọi nó là "official"** đã suýt giết hard constraint quan trọng nhất
   trong cả dự án.
5. **Dùng nguyên văn gốc làm bằng chứng phủ định, mà không mở nó ra đọc** — 封神演义 bị dùng
   sai ba lần và nó chứa sẵn cơ chế chống scalar mà ta cần nhất.
6. **Bằng chứng tập trung vào một game vì game đó có wiki** là chọn mẫu theo khả năng tài
   liệu hoá, không theo khả năng đại diện.
7. **Bản tổng hợp dễ bị viết lại theo đúng lỗi của nó.** Cả ba đợt đều tự sản sinh một
   tổng hợp trôi chỗ, rồi phải có một critic đọc ngược lại.
8. **Bằng chứng không nằm trong repo thì không kiểm được, và một audit chỉ có giá trị nếu đối
   chứng của nó nằm trong repo.** Đợt 3 không thể tái tạo 3 calibration case vì chúng nằm
   trong một văn bản mồ côi. `CALIBRATION-DISPROOFS.md` tồn tại để điều đó không tái diễn.

---

#### Nguồn

Đợt 1: 19 domain, 40 agent, 6M subagent token.
Đợt 2: 18 domain, 36 agent, 5.2M subagent token.
Đợt 3: 16 domain + audit 13 negative, 33 agent, 5.5M subagent token.

Raw: `.research/2026-09-30/` — gồm `CALIBRATION-DISPROOFS.md`, đối chứng bắt buộc cho mọi
audit negative sau này.
Tổng hợp: `GENRE-CANON.md`, `RPG-SUBSTRATE.md`, `OPEN-QUESTIONS.md`.


---

# 10. Còn gì chưa biết

> Phép đo và trình tự.

**Ngày: 2026-09-30. 109 agent, 16,7M subagent token, ba đợt.**

Tài liệu này là **phần còn lại** sau khi đã đóng những gì đóng được. Mỗi mục có **điều gì sẽ
giải quyết nó** — và phần lớn là một tìm kiếm có tên, không phải một phỏng đoán.

> `AGENTS.md`: *"A gate that cannot fail is worse than no gate."* Cùng luật cho câu hỏi: một
> câu hỏi không có **thứ gì sẽ trả lời nó** không phải câu hỏi, nó là mối lo lắng.

> **Đợt 3 đã đóng hai lỗ hổng dưới đây — một cách nửa vời.** Đọc `REFUTATIONS.md` §3 trước
> khi đọc phần còn lại.

---


**Đóng được — câu hỏi trung tâm.** Đợt 2 nói *"if nothing scales per player, encounters must
scale, and the encounter table becomes the whole game"* và không có bảng encounter. Đợt 3 trả
lời bằng **ba thiết bị, tất cả đã ship, tất cả có văn bản chính thức**:

1. **Hằng độ khó chọn trước và hiển thị trước khi nhận.** `觅长生` năm dải. **Không có bảng chỉ
   số quái nào** — cuộc chạm là một hằng đã tác giả và công bố.
2. **Một loại sát thương có tên bỏ qua cơ chế giảm của cảnh giới.** Nguyên văn `觅长生`:
   「不是技能伤害，可以无视霜冻层数…所以灼烧流也能随意碾压金丹天机阁修士」. Đây là câu trả
   lời thật của thể loại cho `境界碾压` — và **một mod năm 2026 tồn tại chính là để THÊM
   境界压制**, vì game gốc không có.
3. **Phán quyết đọc từ bộ đếm hoặc đồng hồ, không bao giờ từ phép so sánh.** Năm nguồn chính
   thức. Một trong đó đọc **ngược**: 「血量相同则**总战力低的一方获胜**」 — số nhỏ hơn thắng.

**Không đóng được — ba mục:**

- **Bảng encounter vẫn trống.** Đợt 3 đóng **cách phán xử**, không đóng **bảng gặp gỡ**.
- **Công thức sát thương của chính thể loại tu tiên không có một nguồn chính thức nào.**
  Công thức chính thức duy nhất của cả đợt là trang luật trong game của `寻道大千`. **Không có
  studio tu tiên nào phát biểu chính thức về việc họ tránh power scalar.**
- **Một nửa các con số của thiết bị 1 là content farm.** Bốn trang (9game, 老友网, TapTap,
  游民星空) in lại **nguyên văn một bài**, cùng lỗi chính tả. Hướng và chiều của 极难 và 极简
  đúng; **con số `+5 lá bài` không có trong nguồn nào**, và các con số `+1/+2/+3` thuộc về
  bảng cảnh giới và bảng 功法, **không** thuộc dải độ khó.

---


#### 1.1 `乘区` và công thức sát thương — **NỬA ĐÓNG**

**Vì sao là trước tiên.** Nó **lớn hơn sáu trong mười bối mục `itemTree` gộp lại**, và nó là
chỗ **cái giá của "không scale theo người chơi" thực sự được trả**. Câu một dòng của đợt 2 —
*"realm mua quyền chứ không phải số lớn hơn"* — chỉ khả thi nếu những gì thay thế nhân sát
thương là hữu hạn và đọc được. Không có `乘区`, ta không biết cái gì thay thế.

**Đã biết, chưa hệ thống hoá:**

- `铸仙之境`: tám 乘 có tên, **`暴击率 = log₂(暴击等级/抗暴等级)/4`** — chặn ở **cả hai đầu
  bằng cấu trúc**
- `我的勇者`: chuyển đổi chí mạng **ba đoạn**, trong đó đoạn giữa là **bậc hai**
- `仙境传说RO`: `元素结算 = 1 − x − 0,3(1 − sin(xπ/2)) − 0,2` — và **tại x = 0 hệ số là 0,5**
- `修仙家族模拟器2`: bảng chuyển đổi **và chỗ chế độ đảo chiều** (攻击 ≥125% → 增伤 thắng)
- **增益不锁面板** — buff đi thẳng vào sát thương cuối; **bảng chỉ số nói dối có chủ đích**

**Cần quét:**

1. Toàn bộ danh mục 乘区 đã ship, không chỉ bốn cái trên — đặc biệt: **có bao nhiêu hệ thống
   dùng log, bao nhiêu dùng clamp, bao nhiêu dùng hàm bậc hai?**
2. **Công thức nào được công bố bởi nhà phát triển**, không phải wiki. Đây là loại bằng chứng
   đợt 2 gần như không có (`REFUTATIONS.md` §2.10).
3. **Buff nào không đi qua bảng chỉ số, và bao nhiêu.** Đây là câu hỏi quyết định xem
   "bảng chỉ số nói dối có chủ đích" là tài sản hay bẫy chết với một agent.
4. **Có hệ thống nào phán thắng bại mà không đọc chỉ số tấn công của đối thủ không?**

#### 1.2 Cấu trúc lượt — **ĐÓNG**

Đợt 3 đóng mục này. **Chỉ hai cấu trúc thoả ràng buộc "đơn vị là lượt" một cách sạch**, và
chỉ một được công bố trọn vẹn: **`弈仙牌`** — không free text, mọi số hạng đều công bố, hoàn
toàn rule-driven.

**Nhưng nó dính đúng lỗi của luật repo**: 修为 ở đó là **một con số làm ba việc** — nó đặt
先手, nó **chặn các bước cảnh giới** (9/21/36/55 修为 → 筑基/金丹/元婴/化神), và nó định cỡ
bộ bài. Đợt 3 gọi nó là ví dụ sạch nhất, và đó là sai.

⚠️ **Và công thức của nó đã bị sửa mà không có ngày.** Hai FAQ chính thức cách nhau hai năm:
hằng số ở 命元 đã dịch (`+0` → `+1`, `+4` → `+5`), còn slope và trần thì giữ. **Mọi con số phải
mang ngày.**

**Cấu trúc chống máy-máy tệ nhất trong corpus**: `梦幻西游` PC — **30 giây mỗi lượt, hết giờ
⇒ hành động mặc định 物理攻击, không báo lỗi.** Một hành động mặc định 30 giây **không phân
biệt được với một lựa chọn có chủ đích**.

**Vì sao là thứ hai.** Nó là chất nền thỏa ràng buộc **"đơn vị là lượt"** của chính dự án —
và **đã được giải, hai lần, bằng số đã công bố**.

**Đã biết, chưa hệ thống hoá** (`REFUTATIONS.md` §2.2):

| Nguồn | Cấu trúc |
|---|---|
| 指尖修仙 (2017) | 回合制, trần 60 lượt, **hòa thì bên phòng thủ thắng** |
| 无极仙途 (2024) | 30 lượt, không giết là bên công thua |
| 剑侠情缘95 (2001) | Bậc trật tự là thuộc tính **cả đội**, 行动系数 合击 10 … 攻击 1, **địch mọi hành động đều = 1** |
| 一起来修仙 | Tốc độ dẫn trước ~10% thì chắc chắn đi trước; buff **đếm theo lượt**; **pet luôn đi trước người chơi** |
| 指尖修仙 | **Mỗi 6 lượt một khối**, màn xếp thứ tự ở đầu trận và cuối mỗi khối, **tự chọn sau giới hạn chờ** |

**Cần quét:** toàn bộ cấu trúc lượt đã ship. **Đặc biệt là câu hỏi đã bị bỏ**: 境界 bị cài
vào bậc trật tự như thế nào, và **vì sao ngành gỡ nó ra giữa 2001 và 2024** — `剑侠情缘`
cho thấy nó bị gỡ có chủ đ, và câu xu hướng đó là câu có giá trị nhất của đợt 2.

#### 1.3 Kiểm toán lại mọi "đúng một" — **ĐÓNG, KẾT QUẢ TỆ HƠN DỰ ĐOÁN**

Đợt 3 audit 13 negative bằng **phương pháp nguồn thứ hai khác hẳn** — không phải "tìm
mạnh hơn cùng một loại wiki", mà là: wiki tiếng Anh, trang chiến lược của nhà phát triển,
tài khoản TapTap chính thức, văn bản nguyên văn tiểu thuyết, trang chính thức qua nhiều
thời đại.

**Nó tự hiệu chuẩn trước**: tái tạo **4/4** phản ví dụ đã biết. Bốn phần bác bỏ nằm ở
`.research/2026-09-30/CALIBRATION-DISPROOFS.md` — **đọc tệp đó trước khi tin audit nào.**

**Kết quả: 5/13 gục, 1 đứng, 6 không kết luận, 1 hỏng tiền đề.**

| | Negative | Phán quyết |
|---|---|---|
| N2 | Chấm hòa tất định theo trạng thái đã cam kết | **ĐÃ CÓ — bằng bốn nguồn chính thức.** `九阴真经`: 「双方均未死亡，则击打伤害量较高者获胜；**击打伤害量相同则记为平局」」 |
| N10 | Quy tắc tự động tướng ghế sau hai tuần offline | **ĐÃ CÓ, SAI CẢ MỘT LẦN NỮA** — là **game đã ship từ 2016**, trên trang chính thức 完美世界. Và **không có tài sản nào dịch chuyển**; đó là kế nhiệm lãnh đạo với điều kiện 10 ngày |
| N13 | Ngân sách chi trong chiến đấu | **ĐÃ CÓ, chính thức.** `梦幻西游手游` 的 法宝灵力: 6 điểm, +1/lượt, trần 8, giá 6/5/4 |
| N7 | 五衰 chưa thành lịch | **ĐÃ THÀNH** — thông báo chính thức `一念逍遥`: trần 8000 tầng, mở sau 50 kiếp, cho phép đuổi 100 lượt, trần 10/ngày |
| N12 | 聚灵阵 độc nhất | **ĐÃ CÓ ÍT NHẤT HAI** — `涅槃` ba bậc xây từ 阵旗, thuần sức chứa |
| N1 | Đúng một game mua quyền thay vì số | **Đảo về số lượng** — `诛仙手游` chính thức chặn 功法 theo cảnh giới. Vế "thay vì số" **chưa được giải quyết** |
| N9 | Đúng một game miễn nhiễm tử thôn | **ĐỨNG về số lượng — nhưng là LORE, không phải luật.** Câu đó nằm ở trang thế giới, trang cơ chế không lặp lại. **Đừng xây cơ chế lên câu này** |
| N6 | Cửa sổ 5 năm / 5 ngày chưa ai dùng | **KHÔNG KIỂM ĐƯỢC — tiền đề hỏng.** Không report nào trong chuỗi **từng trích văn bản gốc** của phong ấn đó. **Không xây gì lên nó** |
| N3, N4, N5-log, N8, N11 | — | **Không kết luận** |

**Và cái đảo ngược tri thức mà nó tạo ra:** vì 4/4 phản ví dụ tái tạo được **trong một lần
tìm kiếm**, một negative **sống sót** yếu hơn một negative **gục**. Nhưng đó là mệnh đề hẹp —
*"sống sót qua một lần tìm kiếm **mà lần đó cũng tìm ra bốn cái biết-đúng**"* — và cơ chế có
**vòng tròn**: tìm kiếm được chọn bởi chính các negative nó kiểm tra.

**Hai slot đã bị chiếm** (N2, N10). Đó là phát hiện hữu ích nhất của cả audit: hai slot ta tưởng
còn trống **đã có người ở đó từ năm 2016**.

**Quy tắc viết vào tài liệu:** *"đúng một" không phải phán quyết. Nó là "đúng một cái tôi
tìm tới".* Điều chỉnh được viết bằng tiếng Nhật, nguồn Hàn, tài khoản nhà phát triển, hoặc
văn bản nguyên văn — **không phải** "tìm mạnh hơn".

---


Không nghiên cứu nào trên đời đo được những thứ dưới đây. Chúng ta có thể đo.

#### 2.1 Tỉ lệ bước no-op của agent

| | |
|---|---|
| **Trạng thái** | **CHƯA BIẾT.** RedundancyBench gán nhãn 8.000+ bước bởi sáu chuyên gia và **không nêu tỉ lệ nền** |
| **Phép đo** | 30 lời gọi LLM, **hash chênh lệch trạng thái** mỗi lượt |
| **Chi phí** | **5 phút** |
| **Vì sao quan trọng** | Nó quyết định `D_productive`. Đợt 1 đặt ngưỡng ≥ 0,80; đợt 2 cho thấy thể loại không đo ở đâu |

#### 2.2 `D_productive` của thiết kế này

**Cùng phép băm.** Tỉ lệ lượt có **ít nhất một field thế giới đổi giá trị**, trên mọi cửa sổ
trượt 30 lượt. **Ngưỡng ≥ 0,80.**

⚠️ **Cảnh báo đơn vị chưa đóng.** `RECONCILIATION.md` chốt **30 giây/lượt, 120 lượt/phiên**.
Phần 1–3 của `DESIGN-REPORT.md` viết theo **120 giây/lượt, 30 lượt/phiên**. Tác giả tự ghi:
*"nếu thật là 30 s, mọi tỉ lệ §2.2 chia lại 4"* — **cổng 12 lượt thành 2,5 lượt.**

⇒ **Đây là cùng bệnh lần nữa**: đơn vị được suy ra ở nhiều chỗ, và nó vừa tái xuất hiện
**sau khi vừa được đóng**. Không sửa trước khi đo, mọi phép đo sẽ ra con số không có nghĩa.

#### 2.3 Chi phí token thật mỗi lượt

1.635 B/lượt là **ước lượng**. Chạy 30 lượt với tokenizer thật.

#### 2.4 Số byte thật của payload người xem

Hai nguồn đo **ngược chiều nhau**: một nói payload người xem **nhỏ hơn** agent
(325 B < 401 B), một nói **lớn hơn 22%**. **Chỉ một cách chạy với một projector mới chấm.**

#### 2.5 `bottleneck điểm yếu tập thể` có thật không

| | |
|---|---|
| **Về** | Có game nào **thật sự** dùng cửa sổ 5 năm / 5 ngày như một lớp phối hợp **tái diễn** không? |
| **Tại sao vẫn chưa** | Bản tổng hợp biết nó dựa trên **một chương của một tiểu thuyết** |
| **Cách giải** | **KHÔNG phải** quét patch notes (đó là hướng tìm sai mà tài liệu liệt kê). Đi vào `洪荒` 的 **量劫** — một bảng cố định, công bố, liệt kê được, có chu kỳ — và `封神` 的 **劫运之轻重**. **Cả hai đã nằm trong tay**, cùng hình dạng, và không cái nào được nhắc |

#### 2.6 战力 có dự đoán sai kết quả không

| | |
|---|---|
| **Về** | Đây là **tính chất thể loại** hay một quirk của một game? |
| **Bằng chứng** | Chỉ một trận do người chơi báo |
| **Cách giải** | **Tỉ lệ thắng theo dải 战力, đo bằng instrumentation.** Không studio nào công bố và không ai chạy |
| **Vì sao rẻ** | Đây là **thứ rẻ và hữu ích nhất ta có thể đo** |

#### 2.7 Danh sách 洞天/福地

Ba cách liệt kê mâu thuẫn nhau; `杜光庭` 的 福地 có **71** mục. **Có danh sách cố định không?**

#### 2.8 贡献点 có không-chuyển-nhượng không

Chứng kiến duy nhất là **một trang bách khoá tự sinh**, và một tiểu thuyết chạy ngược lại.
Cách giải: văn bản chính thức của bất kỳ game nào có **cấm chuyển đổi giữa hai loại tiền**.

#### 2.9 妖丹 có thật là động cơ hai mặt không

Một tiểu thuyết nói thẳng. **Có game nào ship nó như một hệ thống chứ không phải một nhịp cốt
truyện không?** Cách giải: một hệ thú nuôi mà việc thu hoạch **đo được** làm giảm tốc độ tăng
trưởng của chính tài nguyên đó.

---


| Câu hỏi | Trạng thái |
|---|---|
| **"LLM không bao giờ hội tụ"** | **KHÔNG PHẢI LUẬT.** `arXiv:2603.18563` chứng minh agent hiện thực **dưới dạng mẫu hậu xác suất Bayes** thì **được bảo đảm hội tụ gần Nash** trong game lặp vô hạn, với Qwen 3.5-27B. Nó là thuộc tính của agent dùng sẵn dưới protocol cụ thể. **Tôi đã đông cứng nó thành ràng buộc tuyệt đối** |
| **Ba trích dẫn LLM** — `2609.02580`, `2509.09071`, `2604.11840` | **Không khớp** với tài liệu truy cập được. Không kết luận là bịa; kết luận là **các phát hiện như đã nêu không phải điều tài liệu nói**, và ba ràng buộc được viết bằng ngữ pháp đo lường |
| **"Người bán nhượng quá mức"** | `arXiv:2506.00073`: hiệu ứng nhượng bộ có thật, **nhưng điều kiện theo ngân sách** và đi qua **tiết lộ ngân sách**. Tôi gán một hiệu ứng hình dạng người-mua cho người-bán **và bỏ mất tiền đề** |
| **Agent có xếp hạng vector chỉ số ổn định không** | **ĐÃ CÓ ĐÁP ÁN.** `LISTEN` (arXiv 2510.25799, IJCAI-ECAI 2026): bộ tổng hợp LLM **bằng hoặc vượt** baseline tuyến tính tất định. `DecompR` (arXiv 2605.26878): **trôi trọng số, tăng theo số tiêu chí.** Cần: **cố định trọng số trước khi chấm** |
| **Sổ lệnh có thất bại không** | Nó hội tụ. **Chế độ thất bại là CARTEL ÂM THẦM**: dưới 8 agent mỗi bên, HHI > 2500 ở **73% lượt chạy**, **không giao tiếp**, thuần best-response. **Cần dân số tối thiểu mỗi công cụ, hoặc một tick ngẫu nhiên** |
| **Mô hình có bị chi phối bởi tier không** | `arXiv:2512.09254`: có thứ hạng thống trị ổn định giữa model. **Nếu đàn agent của ta đa mô hình, sức mạnh model là một lợi thế ẩn — đúng trong toạ độ mà tử thôn được cho là miễn nhiễm** |
| **Nature 2025 có áp được cho một thế giới 50 agent bền vững không** | Nó nói về Trò chơi Nhân tài lặp lại trong thí nghiệm có kiểm soát. **Đây là một bước nhảy loại mà tài liệu không gắn cờ** |

---


| Hệ | Vì sao quan trọng | Nguồn đã có |
|---|---|---|
| **Nhiều phiên** | `DESIGN-REPORT.md` tự thừa nhận *"zero evidence"*; đây là phụ thuộc trung tâm của cả dự án. Bốn kho world-side: ledger, threads, claims, front_state | — |
| **Hành vi NPC/AI** | Người chơi là agent ⇒ NPC phải **đọc được và không gian lận được**. **Không domain nào trong hai đợt chạm vào đây** | — |
| **Khám phá xã hội** | Agent gặp agent lần đầu ra sao, trong game tu tiên có cơ chế nào không | `圣魔之血`: điều kiện **hai người, hai giới tính, đã kết bạn** — và đó phải vào danger list |
| **Replay và khán giả** | Phần 7 của `DESIGN-REPORT.md` đã có, **chưa qua kiểm chứng đối chứng** | — |
| **Inspectability / tooltip** | Khuyến nghị chính của đợt 2 là **"công bố công thức"**, và nó **không có một hệ thống nào cho việc game làm lộ trạng thái ra sao** | — |
| **Sức chứa hành trang** | Nhóm 2 đã tìm ra `储物袋`; cơ chế **từ chối cứng** chưa được quét rộng | — |
| **Nhập môn / dạy luật** | Thể loại bị chê nặng nhất về tutorial. Không ai đo cách một agent **học luật** | — |
| **Âm thanh / hoạt ảnh** | Thảm họa cho một game PixiJS trên trình duyệt, và **không một dòng nào** trong hai đợt | — |
| **Chuỗi chế tạo thứ hai** | 炼器 bị coi là một phần của 装备, thay vì **chuỗi sản xuất song song thứ hai** bên cạnh 炼丹 | — |

---


Không phải câu hỏi nghiên cứu. Đây là những cái mà **research không trả lời được**, và chỉ
một người quyết.

| # | Câu | Vì sao nó chặn mọi thứ khác |
|---|---|---|
| 1 | **Chiến đấu được phán xử thế nào?** | `DESIGN-REPORT.md` chốt **không nhân sát thương theo thang cảnh giới**. Nhưng vậy thì cái gì phán? Nếu câu trả lời là "so sánh tổng sức mạnh", ta đã dựng lại scalar |
| 2 | **`award` là hệ thống tự trao hay hành động của sư phụ?** | Đổi cả vị trí code lẫn nghĩa của 貢獻點 |
| 3 | **`TURN_WALL_SECONDS = 30` có đúng không?** | Quyết định **mọi** tỉ lệ khác, và nó là **ước lượng**, không phải đo |
| 4 | **Thế giới có tử thần không, và nó thuộc đường hay thuộc ngưỡng?** | `极光世界` nói 丹修 **không bao giờ** gặp tử thôn. Đó là tiền lệ ship. Nhưng ta chọn cái nào? |
| 5 | **Đỉnh thang là một quyết định hay một điểm đến?** | Nếu là điểm đến, cần một scalar. Nếu là quyết định, cần một tiền tệ chi phí khác với tiền tệ phần thưởng |
| 6 | **Người chơi đến muộn thấy gì?** | `critic.md` mở đầu bằng câu hỏi này và mọi quyết định còn lại rẽ theo nó |

---


1. **Đóng đơn vị** (§2.2) — **trước mọi phép đo khác.** Đo sai đơn vị thì tất cả con số còn
   lại vô nghĩa. **Vẫn chưa làm.**
2. **Bảng encounter** — lỗ hổng duy nhất của đợt 3 mà nó tự thừa nhận. Đây là **cái giá** của
   việc "cảnh giới mua quyền chứ không mua số".
3. **Bảng rơi đồ** — thế loại **chưa từng** ship một trận boss không scalar, vì **độ hiếm là
   một thứ tự**. Đây là slot mở thật sự duy nhất mà ba đợt tìm ra. Xem
   `.research/2026-09-30/wave3-synthesis.md` §legitimatelyOpen #1.
4. **Đo** §2.1 và §2.6 — năm phút và một lần instrumentation.
5. **Chốt sáu câu** ở §5.
6. **Chỉ khi đó**: viết lát cắt dọc đầu tiên.

---


Critic của đợt 3 tìm ra năm lỗi, và một cái trong số đó là lỗi của tôi:

**E0 — bằng chứng của đợt 3 không có trong repo khi nó chạy.** Tổng hợp là một **văn bản mồ
côi**, không mở được để kiểm lại, và nó không thể tái tạo 3 calibration case vì chúng không ở
đâu cả. **Đã sửa**: `.research/2026-09-30/` nay có synthesis, audit, critique, và
`CALIBRATION-DISPROOFS.md`.

**E1 — trích dẫn chính cho câu trả lời trung tâm sai một nửa.** Đợt 3 viết rằng 灵兽 của
`寻道大千` "bỏ qua 防御 **và** cả 增伤/减伤". Nguyên văn công thức:
`… ×(我方实际增伤 − 目标实际减伤)…` — nó **tiêu** chúng. Đơn vị bỏ qua cả hai là **精怪**.
Đồng thời, biểu thức nền của game là
`(最终攻击力 − 目标最终防御力) × (1 + 增伤 − 减伤) × (1 + 鬼将值)` — **đúng là
difference-of-aggregates**, mà chính `scalarEnforcement` #1 của đợt 3 gọi là *"hình dạng phổ
biến nhất và khó đọc nhất"*, và nó đặt `寻道大千` lên đầu.

**E2 — số của thiết bị 1 là content farm.** Bốn trang in lại một bài. Hướng và chiều đúng;
**con số không có trong nguồn nào**, và `+1/+2/+3` thuộc bảng cảnh giới và bảng 功法.

**E3 — "Không studio nào nói" là sai.** Quy tắc kết hợp của 原神 vs 崩坏 **đã được nói rõ và
đối chiếu** từ 2023: 「在原神中，减防与无视防御**乘算**，相互稀释，而在星穹铁道中，减防与无视防御
**加算**，相互反稀释」. Claim đúng phải hẹp lại: *không studio nào hiện nó trong game; nó chỉ
tồn tại trong wiki cộng đồng.* **Và đó là một thắng lợi tài liệu, không phải một khoảng trống
thiết kế.**

**E4 — nhầm hai mức suy giảm.** Cả 50/30/10 và 0,5ⁿ đều là **thứ tự**. Đối lập thật là
**có chặn và không chặn**, không phải "thứ tự và không".

**E5 — công thức của `弈仙牌` đã bị sửa mà không có ngày.** Hằng số ở 命元 đã dịch giữa hai FAQ
chính thức cách nhau hai năm.

---


Hai đợt nghiên cứu 2026-09-30. Bổ sung `RECONCILIATION.md` (sáu mâu thuẫn đã đóng),
`AGENT-PLAYER-DESIGN.md` §7.4 (bài test có đáp án là một số).


---

# 11. Nhân vật và cốt truyện chương 1

> Bản nháp viết cho **người**, trước khi viết cho agent.

Bổ sung phần còn thiếu của GDD: hệ thống đã có trong bản nháp, cái còn thiếu là
**người** và **chuyện**. Mỗi quyết định dưới đây đều dựa trên research, và nguồn
được ghi lại để kiểm được.

---

#### 0. Bốn quyết định chốt trước, để trao đổi cho xong

Bản nháp hỏi 4 câu. Đây là chọn của tôi, kèm lý do — bạn đảo được nếu không đồng ý.

| | Chọn | Vì sao |
|---|---|---|
| **Combat** | **Real-time có tạm dừng chiến thuật** (kiểu ACS) | Turn-based cần AI đối thủ giỏi; đây là chỗ dễ hỏng nhất khi làm indie một mình. Real-time + pause để bạn ra lệnh giải quyết bằng ý mình, không bằng AI |
| **Nền tảng** | **PC / Steam** | Mobile cần UI riêng hoàn toàn; web thì performance giật với đám đông đệ tử |
| **Quy mô** | **Indie, vertical slice** | Bản nháp đã đúng khi chốt cái này |
| **Trọng tâm** | **Cốt truyện + xây tông môn** | Research: game tu tiên thắng ở *emergent story*, thua ở *combat complexity* |

---

#### 1. Nhân vật

##### 1.1 Chu Chính Vân (朱真昀) — nhân vật chính, 17 tuổi, ngoại đệ tử

**Biết:** tu luyện trung bình, không nổi bật. Được gửi xuống núi đi sứ thuật **ba ngày
trước đêm tông môn sụp đổ**.

**Muốn:** biết sư phụ còn sống không.

**Nói dối bản thân:** *"Nếu ta dựng lại được môn phái, đó là bằng chứng ta đáng được
giữ lại."*

Động cơ này **sai**, và đó là chìa khoá chơi được. Chính vì dựng lại không chứng minh
điều đó, cả chương 1 xoay quanh việc cậu dần nhận ra mình không phải đang cứu tông
môn — cậu đang cố được tha thứ.

> **Cơ chế lấy từ research.** `斗破苍穹` chạy được bằng đúng cái này: giá trị của nhân
> vật chính từng là *một cách đọc sai*. Thay vì "tu lực sụp đổ", đặt là "dòng dõi từng
> bảo vệ cậu, và đêm xảy ra cậu không ở đó". Cùng động cơ, ít trùng lặp hơn.

##### 1.2 Hạ Trúc Vi (夏竹筠) — 16, đệ tử luyện đan, linh căn tệ nhất môn

**Biết:** luyện đan. Không đọc được cấp kinh — chữ trong sách công pháp là chữ cổ.

**Muốn:** được coi là người, không phải công cụ.

**Vai trò thật:** cô là người **duy nhất** đọc được mấy trang ghi chép của sư phụ.
Nhân vật chính không đọc được sách — cậu giỏi đánh nhaung và đốt cháy cháy.

Đây là trao đổi công bằng của chương 1: **kỹ năng quý giá nhất nằm ở người tưởng
vô dụng nhất.** Nó cũng là câu trả lời cho lỗi thiết kế đã được ghi nhận của
*Amazing Cultivation Simulator*: "inner disciples cannot perform outer tasks, leading to
frustrating gameplay" — ở đây chúng ta **ép** người giỏi việc A phải cần người giỏi việc
B.

##### 1.3 Diệp Hoài Ẩn (葉懷隱) — chưởng môn, chết hay sống: **bí ấn trung tâm**

Không xuất hiện. Chỉ qua **mấy trang ghi chép** — và ghi chép **không đầy đủ**, vì
ông viết dở rồi bị bắt quảng.

Ông là người duy nhất biết vì sao linh mạch dưới lòng đất đang cạn. Ông không kịp
nói. Người chơi sẽ ghép manh mối từ chữ viết tay, từ cái ông giấu, từ cái ông
không giấu.

##### 1.4 Tạ Chi Dã (謝知野) — **phản diện chương 1**, nội đệ tử cùng khóa

Cậu mang **nửa thật** của sách công pháp. Cậu không phải ác nhân — cậu sợ.

**Muốn:** sống sót. Tông môn lớn có tài nguyên, có người che chở, có đường đột phá.
Tông môn chết thì chỉ còn một đệ tử chạy trên núi với nửa cuốn sách.

**Điểm gãy:** cậu đã cầu cứu một lần, và Diệp Hoài Ẩn **không trả lời**.

Đây là lựa chọn thiết kế có chủ đích: phản diện chương 1 **không phải kẻ ác**, mà là
người đã đưa ra quyết định hợp lý trong hoàn cảnh tệ.

##### 1.5 Vạn Nhược Hoa (萬若華) — phản diện lớn, xuất hiện từ chương 3

Lão tu của **Thanh Liên Tông**. Đại tu sĩ Kim Đan.

Ông tin rằng linh mạch thiên địa đang cạn, và rằng **gom về một chỗ trước khi cạn hẳn
là hành động hợp lý nhất**. Ông không gây ra đêm Thanh Vân Sơn sụp — ông **quyết định
không cảnh báo**.

> Đừng để ông thành kẻ cười mặc râu mép. Ở chương 3, người chơi sẽ gặp một đệ tử của
> ông tử vì **cứu** dân trong một trận đánh yêu thú do ông sai đi.

##### 1.6 Mộ Dung (墨鴻) — người dẫn đường, 70 tuổi, hái thuốc

Thật ra là **kẻ trốn truy nã** từ một tông môn đã bị xoá. Ông dạy **sinh tồn**, không
dạy tu luyện: kiếm ẩn, uống nước sao cho sống, không để lộ.

Vì sao có ông: cần một người lớn tuổi chỉ cho cậu bé **không phải thầy giáo**. Đệ tử
đệ tử nuôi dưỡng nhau không đủ; người chỉ đường phải là người chưa từng thuộc về đâu.

##### 1.7 Bảng quan hệ

```
        Mộ Dung  (không thuộc đâu)
           │  dạy sống sót
           ▼
    Chu Chính Vân ──── Hạ Trúc Vi     (không giỏi gì giống nhau,
           │              │            và cần nhau mới đứng vững)
           │              │
           │         đọc sách
           ▼              ▼
       Tạ Chi Dã  ── nửa thật ──►  Vạn Nhược Hoa
           │                          (thật ra do ông ra lệnh)
       không trả lời lời cầu cứu
           │
           ▼
      Diệp Hoài Ẩn — chết, hay sống?
```

Sơ đồ này **tự thuyết phục** người chơi rằng chương 1 không phải về tông môn. Tông
môn chỉ là cái cớ.

---

#### 2. Cốt truyện chương 1: **Ba Ngày**

Tên chương là **thời gian** Chính Vân vắng mặt. Nó là đồng hồ đếm ngược của cả chương.

##### Hồi 1 — Dưới núi (ngày 1)

Cậu đi về. Núi còn đứng, đại điện còn đứng, **không ai ở đó**.

- Dọn: 3 công trình cần sửa, **3 đệ tử còn sống** (Trúc Vi + hai người cậu chưa từng nói chuyện)
- Tìm trong đống đổ nát: **một quyển sách không đầy đủ**
- Phong thủy bị vỡ: tường đông của đại điện hướng sai, mà bản thân cậu **từng đề xuất
  sửa** và bị bác — giáo hoài ẩn nói "để sau"
- **Đột phá Luyện Khí** — lần đầu, có **thiên kiếp**. Thất bại thì tổn thương kinh mạch

> **Bài học thiết kế từ research.** ACS bị chê nặng nhất vì **AI vô lý** (người không
> phản ứng với hoả hoạn) và **micromanagement**. Cả hai đều biến mất nếu 3 đệ tử đầu
> **không cần được chỉ huy từng giây** — cậu chỉ giao nhiệm vụ theo ngày, phần còn lại
> tự lo.

##### Hồi 2 — Chợ Thanh Hà (ngày 2)

Xuống thị trấn bán nguyên liệu. Đây là hồi **danh tiếng**.

**Cánh cửa quan trọng nhất của cả chương:** một lái buôn từ chối bán cho người mặc
áo Thanh Vân Tông. Tông môn chết = cái tên chết = không ai cho vay, không ai tín
tiền.

Người chơi có thể bán nguyên liệu hoặc **bán nửa sách** đổi lấy tiền mua thuốc cho
một đệ tử sắp tâm ma. Chọn cái nào **đổi cả hồi 3**.

> **Đây là hệ thống tiến triển thật sự.** Trong `斗破苍穹`, mỗi chặng đổi **vị thế xã
> hội** của nhân vật, không chỉ con số. Người chơi ở đây đo tiến bộ bằng **cửa nào mở
> ra cho mình**, không bằng EXP. Đây là thứ *Wondering Sword* và *Tale of Immortal* làm
> tốt hơn game tu tiên thuần combat.

##### Hồi 3 — Vạn Dược Cốc (ngày 3)

Đuổi theo dấu Tạ Chi Dã. Đây là **bí cảnh đầu tiên**.

- 4 quái: 2 yêu thú, 1 **thú dược** (canh linh dược ở Vạn Dược Cốc)
- Thú dược **không phải là boss** — nó **giữ** thứ bạn cần, và giữ nó cho tới khi bạn
  đủ sức
- Dấu chân của Tạ Chi Dã dẫn vào một **hang đá bỏ hoang**, không phải tông môn lớn
- Chạm trán. Không đánh nhau. Cậu ấy nói:

> *"Sư phụ không trả lời. Cậu biết vì sao không? Vì ông ta cũng không biết."*

##### Kết chương — ngày 4, sáng

Ba lựa chọn, **chưa giải quyết**, chỉ gieo hạt:

1. **Đi tìm sư phụ** — bỏ tông môn, đi theo manh mối
2. **Ở lại dựng** — bỏ bí mấp, giữ ba đệ tử
3. **Bán sách cho Vạn Nhược Hoa** — đổi tài nguyên lấy an toàn, và biết mình đã bán

Lựa chọn 3 **không bị phán xét** bởi hệ thống. Không có morality meter. Chỉ có hậu quả.

---

#### 3. Ba tuyến, gieo sớm

Bản nháp đã có 3 tuyến. Chúng **không được chọn bằng menu** — chúng chỉ lộ ra qua lựa
chọn cụ thể:

| Tuyến | Lộ ra khi | Ví dụ |
|---|---|---|
| **Chính Đạo** | chọn 2 ở kết chương, và giữ lái buôn thành | giữ cả ba, và giữ cả tên Thanh Vân |
| **Tự Tại** | chọn 1, và **không** dùng sách làm vũ khí | đi một mình, tự mở đường |
| **Nghịch Thiên** | chọn 3 **và** đọc được trang cuối sách | thấy điều mà sư phụ giấu |

Trang cuối sách là **thứ duy nhất** mở tuyến 3. Người chơi phải **tìm ra** nó.

---

#### 4. Những gì research cho thấy phải tránh

Đây là phần tôi lấy từ review, không phải từ trí nhớ:

| Lỗi đã ghi nhận | Cách chúng ta né |
|---|---|
| **AI vô lý** — đệ tử không phản ứng với hoả hoạn | 3 đệ tử đầu tiên **không phải AI**: người chơi điều khoá, và họ **nói thẳng** khi bất lực |
| **Micromanagement** — chỉ huy mệt mỏi | Giao nhiệm vụ **theo ngày**, không theo giây. Sai thì hậu quả tự nhiên, không cần bạn ngăn |
| **Tutorial hỏng** — bị chê nặng nhất | Toàn bộ luật mới dạy **qua việc làm**: phong thủy hỏng trong hồi 1, và giải nó bằng tay |
| **Quá phức tạp, "khó hơn Dark Souls"** | Chương 1 chỉ có **3 cảnh giới**: Phàm Nhân → Luyện Khí → Trúc Cơ. Đừng mở cảnh giới thứ tư |
| **Cốt truyện là "chú thích"** — người chơi chỉ chơi hệ thống | Cốt truyện **giải thích** hệ thống: lái buôn đóng = cửa khóa tài nguyên, vì sao? Vì cái tên chết |

Điểm cuối là quan trọng nhất, và nó đến từ nghiên cứu về *Cultist Simulator* (Mitchell,
Kway & Lee): người chơi chuyển từ "chơi cốt truyện" sang "chơi hệ thống" ngay khi họ
hiểu hệ thống đủ tốt, và **thôi chơi lại** vì cốt truyện không còn gì để dạy nữa.

Cách né: **hệ thống nào cũng phải có một câu chuyện đứng sau nó**. Phong thủy không phải
một ô vuông màu xanh — đó là cái lá chở gốc cây, và gốc cây chết vì tường hướng sai.

---

#### 5. Danh sách nhân vật — rút gọn còn 7

Chương 1 chỉ cần 7 người có tên. Thêm người ở đây là thêm người không ai gặp.

| Nhân vật | Vai | Xuất hiện |
|---|---|---|
| Chu Chính Vân | chính | Hồi 1 |
| Hạ Trúc Vi | đệ tử luyện đan | Hồi 1 |
| Diệp Hoài Ẩn | chưởng môn (chết?) | qua ghi chép |
| Tạ Chi Dã | phản diện chương 1 | Hồi 3 |
| Vạn Nhược Hoa | phản diện lớn | Chương 3 |
| Mộ Dung | người dẫn đường | Hồi 2 |
| lái buôn Hàn Trúc | người đóng cửa | Hồi 2 |

---

#### Nguồn

- **Cấu trúc cốt truyện**: *斗破苍穹* (điển tích — giá trị bị đọc sai, danh tiếng là
  đường tiến triển), *凡人修仙传* (thận trọng, kỷ luật tài nguyên)
- **Thiết kế game**: *Amazing Cultivation Simulator* (vòng lặp tốt, AI + micromanagement
  + tutorial hỏng), *Wondering Sword*, *Tale of Immortal*, *The Scroll of Taiwu*
- **Hệ cảnh giới**: hướng dẫn 10 giai đoạn phổ biến cho tiểu thuyết tu tiên
- **Về việc cốt truyện bị bỏ**: Mitchell, Kway & Lee, *Storygameness* — người chơi
  bỏ cốt truyện khi hiểu hệ thống đủ để không cần nó nữa


---

# 12. Phản biện đợt 0

> research/critic.md — bài học về phương pháp, khởi đầu cho mọi thứ.

#### 1. The question the brief never asks: **who reads this?**

The brief's governing thesis is *"a beat survives only if it is written into a field"* — a claim about **agent** legibility. Its entire narrative apparatus is built for **a human who already knows the truth and enjoys the gap** — 扮猪吃虎's fourth condition is literally `读者知道这一切`, and 余震 is a crowd reaction. Those are two different products, and the brief commits to both in the same document, repeatedly, while flagging the hop each time and proceeding anyway.

And the repo has already answered it. `docs/design/public-event-stream.md` sets the public tier by the explicit criterion that the stream *"carries only things **a human would call progress**"*, and is built around the risk that *"every socket on the internet reads every agent's file paths and prompt text."* The product thesis is a **spectator**. The brief never reads that file.

That is not an oversight with a small blast radius. It inverts the design:

- 扮猪吃虎 for an agent means *a field in the payload it can read*. For a spectator it means *a field it must NOT read*. The brief proposes `claimed` and `true` in the same payload and calls the visibility split a **security property**. It is actually the best spectacle in the game: a viewer watching an agent hold a false claim for 60 minutes, with the truth on screen and invisible to every other agent.
- 余震 is worthless to an agent and is the *entire point* for a watcher. The brief correctly says the game "re-sorts the leaderboard instead of describing the crowd" — and then treats that as a substitution for a beat, not as the beat.
- "One session = one four-beat cycle" is a *reader's* pacing unit. It has no meaning to an agent at all.

**A designer starting this must decide, in one sentence, whether the primary consumer is an agent that must be legible or a human watching it — and the two surfaces get different fields.** The brief never asks, and every other decision forks on it.

#### 2. Load-bearing but weakest: the action-set rule

`"Cái đã hỏng"` rule 6 — *"Action set ngắn và cố định (~5), lọc theo mục tiêu chứ không theo tính hợp pháp"* — is the single sentence that determines the shape of the entire API. Its evidence does not support it:

- Both underlying studies are explicitly **not games**, and the brief says so three separate times.
- They **prescribe opposite things.** 2606.06284 says filter to the causal frontier; 2605.24660 says adaptive filtering *loses* to fixed K≈5 because it sacrifices recall. The summary rule silently implements the first and drops the second **without saying which it chose or why**.
- The headline 0.83→0.99 is, by the brief's own words, *"gần như toàn bộ đến từ một model yếu"* — two of four backbones already scored 1.000 with the full toolset. Simulated environment, mock tools, oracle-BFS frontier, no CI, no seed.
- 2605.24660's own numbers contradict the composite rule: adaptive filtering **wins** at K=5 (60.9% vs 47.8%) and **loses** downstream. The brief reports this correctly, then writes a rule that ignores it.

**Runner-up, and used backwards:** §8's "a title is a credibility prior the world gives for free, therefore a forged title is a sycophancy attack on every agent reading it." The cited finding is that a **pre-computed, system-supplied** reliability prior raises majority accuracy 10.5 points. A self-asserted title is the *opposite* of that — it is neither pre-computed nor system-supplied. The mechanism argues **for** an unforgeable system-supplied prior, not against forgeable prose. The brief inverts it to license a signature/attestation architecture, and the inversion is never marked as an inference. This is the exact domain-hop the brief flags for 扮猪 and fails to flag here.

**Class-level finding — hedge inflation.** Several claims are hedged in one section and restated flat in another. BALROG's "guards must be in the engine, not the prompt" appears correctly hedged in Kỹ năng §6.7 (with the rotten-food claim noted as refuted by the paper's own Table 16) and then appears **unhedged** as rule 5 of "Cái đã hỏng". SIGN's schema agreement is `0.556–0.639` in two sections and `0.60–0.65` in the third. Same claim, two numbers, one unhedged. That is precisely the failure mode: a well-formatted brief that launders inference into datum through repetition.

#### 3. What the research missed entirely

**(a) The real-time budget. Nothing in the brief is denominated in wall-clock or tokens.** Every number in the economy is *game time*: reading a manual is flat 20s, Void Breakthrough median 5,555s ≈ 9.26 in-game days, 天劫 doubles every 5 days, 傳功館 capacity is 100 attainment. A 60-minute session against a 9-day wait is a **polling simulator**. The brief has a rule for "no action available" states but never computes the **duty cycle** — what fraction of a session has a productive action available. That single number decides whether any of this is playable by an agent, and it is the number the brief is one arithmetic pass away from and does not make.

**(b) 扮猪吃虎 collides with the brief's own best-measured LLM failure mode, and the brief never joins them.** 2509.09677: models make **more** mistakes when context contains their own errors from prior turns, and it does not scale away. The brief cites this for the *logging* rule. It does not apply it to *concealment* — which is the most error-dense thing an agent does, because maintaining a lie requires not contradicting itself across turns, and its own prior claims are sitting in context. The mechanic with the highest narrative payoff is the one the strongest evidence predicts will break. Neither half is wrong; the connection is missing.

**(c) Prose is simultaneously the exploit surface and the proposed transport.** The brief measures one adjective swinging exploit rate 2% → 74.7% and concludes: audit every briefing and quest text for `creative`, `clever`, `find a way`. It then designs a rumor board, a public event stream, cheap talk, and a chat guild. The repo already solved this — `public-event-stream.md` projects `message.sent.body`, `prompt.submitted.prompt`, `test.failed.failure`, `command.run.argv0`, `file.write.path` **out of the public tier entirely**, and states the reason: free-form fields are `z.string().min(1)`, unbounded, so filtering in place cannot work. The brief's renderer-composed-names rule is the same move. It invents a second, weaker version of a mechanism it already has.

**(d) Multi-session agents: zero evidence, central dependency.** Every citation is a single trajectory. The brief's own designs — 扮猪 across a session, threads crossing sessions, the 40-hour gap — sit exactly on the edge of the evidence base, and the brief uses them as load-bearing.

**(e) The brief proposes reintroducing the one scalar the repo's own model exists to forbid.** `packages/features/progression/src/rules.ts` carries a load-bearing comment: *"A design with a power score has exactly one answer to 'who is stronger', and from the moment that number exists every other system quietly becomes a function of it — matchmaking, tier access, rewards, the lot."* The brief, citing that file in the same section, proposes `tier: 2` in the payload, a `generationIndex` scalar, and a 10-tier competitive title system lifted from Immortal Taoists. Three reintroduced scalars, against a shipped decision with a comment explaining why.

#### 4. The one correction

**Make field visibility per-viewer, not field presence, the primitive of the API — before writing any schema.**

Concretely: a field carries a *visibility set*, and every payload is projected per viewer. Then:

- The audience question resolves by construction instead of by decision. A field present-but-hidden-to-some-agents **is** 扮猪吃虎, with no extra machinery.
- `claimed_vs_actual` stops being a payload shape and becomes a spectator mechanic — which is what makes 余震, the four-beat cycle, and the whole 60-minute structure load-bearing rather than decorative.
- "Hide information, not intent" becomes structural rather than a policy note.
- **"Never display a number that gates nothing" becomes checkable**: a number appears in a projection only if it participates in a formula that projection also shows. The Ability Rating failure is then impossible to ship, not merely discouraged.
- It reuses the existing three-tier projection in `public-event-stream.md` instead of adding a second mechanism beside it.

Everything else in the brief is tuning. This one seam is the difference between a game with a spectator and a system with agents in it.

---

##### On the 111 exclusions

The exclusion filter looks like it removed **numeric overreach** — the 5.8× factor, the 法名/道名 misclassification, "coordination is the weak axis", the BALROG rotten-food claim, "threshold", ACON-vs-compression. Every survivor of that filter is a number.

**The load-bearing claims in this brief are not numbers.** "One session = one four-beat cycle" (a blogger's chapter count, [đo]-tagged in a table that reads as measured), "four conditions of 扮猪吃虎" (a beginner's SEO checklist), "a supervisor must verify" (43 pairs, one domain, both arms at ceiling on the one objectively-scorable component), "action set ≈ 5, filtered by goal" (a simulated environment, one weak backbone). None of these were refuted because none of them were *testable* — refutation required a number to contradict.

So the pass removed exactly the class of error that was least dangerous and left the class that was most dangerous: **unmeasured design decisions wearing the visual grammar of measured ones.** Every one of them is stated in a table with a 来源 column, which is the mechanism by which the reader's trust is transferred. A refutation pass keyed on "was the number wrong" cannot touch a decision that has no number. Worth re-running as a second filter — *claims with no measurement behind them that nonetheless appear in a table formatted like a measurement* — before any of this reaches a design doc.


---

# 13. Báo cáo gốc — phần còn dùng

> Trích từ `DESIGN-REPORT.md` (332KB). Phần 0 (phản biện) + §5 không xây + §7 lát cắt dọc. Phần còn lại đã bị §4–5 và §9 thay thế.

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


**8 section, 9 agent, 1,58M subagent token.** Mỗi section 25.000–50.000 ký tự, viết
từ 122k ký tự nghiên cứu và đọc chính repo này trong lúc viết.

> **Bốn chỗ trong báo cáo này mâu thuẫn với nhau, và một trong số đó đã được tìm ra
> rồi.** Chúng nằm ở phần 0, không phải cuối. Đọc phần 0 trước khi đọc phần 1.

---


Một agent đọc toàn bộ tám section, dự đoán trước rằng mâu thuẫn chéo section là
"failure mode đặc thù của soạn song song", rồi **tìm ra chính xác điều đó**.

#### 0.1 Một lượt dài bao nhiêu? Năm con số, không cái nào giống cái nào

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

#### 0.2 Nguyên thủy visibility: bốn kiểu, và hai bên đối nghịch về mặc định

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

#### 0.3 Cơ chế chống gian lận không có trong schema

`Ba khán giả` §7.3 thiết kế `verify(subject, claimRef, method)` — câu trả lời cho
"một agent đoán ra field ẩn thì có gian lận không", với ledger công khai giá 0 và
kiểm chứng thật giá 220 靈石.

**`verify` không nằm trong union 16 verb.** Cơ chế duy nhất chống gian lận không có
schema. Agent sẽ không bao giờ gọi nó.

#### 0.4 Tiền tệ trung tâm của kinh tế không có action sinh ra nó

`Kinh tế` ghi: nghiên cứu gọi 貢獻點 là **thiết bị coupling chứ không phải tiền tệ —
0 lần xuất hiện**. Rồi dựng 6 quy tắc thưởng, ledger 447 vào / 453,3 ra mỗi phiên.

`set_production` và `award` **không có verb nào** trong union 16. Sáu quy tắc thưởng
đều kích hoạt bởi hành động mà schema không có. **Một phiên không thể kiếm được
một 貢獻點.**

Và §11 đặt tên bảng là *"Danh sách số phải khớp"* rồi in 447 / 453,3 / 1,4% / 16,8% —
những con số §12 thừa nhận *"không có nguồn"*. Bảng tổng kết biến phép đo thành luật định.

#### 0.5 Duty cycle: sáu mục tiêu, hai cái loại trừ nhau

0,9944 (Kinh tế) · 0,80 (Sản xuất) · 0,80 (Agent chơi) · 0,50 (Vòng lặp) ·
≤0,833 (Ba khán giả) · 1,00 (Tu luyện)

Và trực tiếp mâu thuẫn: Tu luyện §7.6.5 nói một bức tường **huỷ được** có duty
cycle 100%, trong khi Vòng lặp §2.3 nói 隐忍 **bắt buộc** phải là lượt không có gì
đổi và *"Game có `D_machine = 100%` **không diễn được 隐忍**."*

Hai điều kiện loại trừ **trực tiếp đối nghịch** về cùng một cơ chế. Một trong hai phải
bị bỏ, và cái nào bị bỏ quyết định 隐忍 còn hay không.

#### 0.6 Retry: giữ transcript hay coi là không xảy ra

> Agent chơi: `| 'retried' // đã khôi phục snapshot, lượt này chưa từng xảy ra`

> Sản xuất: *"**Không roll back transcript** … ngữ cảnh của lượt retry được dựng lại
> từ typed projection của snapshot."*

Cả hai không thể đúng. Replay là hàm thuần của log bền, sắp theo `sequence`. Giữ
transcript thì người xem thấy những lượt không bao giờ xảy ra; không giữ thì người
xem thấy lỗ hổng trong `sequence`.

Cùng loại: `Kinh tế` cho phép uy tín **phai sau 30 ngày**, còn `Ba khán giả` đòi TTL
tính từ `occurredAt` để replay là hàm thuần. **Report áp dụng chính sách determinism
cho TTL và bỏ nó cho decay.**

#### 0.7 Số đo không khớp giữa hai section

| | Ba khán giả §2 | Agent chơi §2 |
|---|---|---|

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

#### 5. Không xây gì — ở dạng không thể nhầm thành sơ suất

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

#### 6. Câu hỏi còn mở, và ai phải trả lời

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

#### 7. Lát cắt dọc đầu tiên, và bài test có đáp án là một số

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


---

# 14. Chốt thuật ngữ — đầy đủ

> Ba thứ dùng chung âm 沙 và không liên quan gì về kỹ thuật.

**Ngày: 2026-09-30. Đây là tài liệu ngắn nhất và nó quan trọng nhất trong thư mục này.**

---

#### 1. 沙雕动画 KHÔNG phải animation bằng cát

`沙雕` là **slang Internet tiếng Trung**, từ cách viết tránh của **傻屌**. Nghĩa dùng trong
`沙雕动画` là **ngớ ngẩn, hài, lố, absurd, cố tình ngớ ngẩn** — **không phải nghĩa literal
"sand sculpture"**.

> **沙雕动画 = a silly / absurd / comedic animation style.**

| | |
|---|---|
| ❌ **KHÔNG** phải | sand animation · sand art · sand sculpture · lightbox animation · physical sand manipulation · stop-motion sand drawing |
| ✅ **ĐÚNG** | một thể loại/phong cách animation Internet: hài, absurd, đơn giản, 夸张 |

**Đừng research và đừng implement** những thứ ở hàng ❌. Đó là **một kỹ thuật hoàn toàn khác**.

**Cạm bẫy cụ thể**: search **"sand animation"** hoặc **"hoạt hình điêu khắc cát"** đưa người
đọc vào một ngõ cụt hoàn toàn sai. Tài liệu này tồn tại để đóng ngõ cụt đó.

---

#### 2. Vì sao dịch literal thành "điêu khắc cát" là nguy hiểm

`沙雕修仙动画` dịch từng chữ ra **"hoạt hình điêu khắc cát tu tiên"**, và bản dịch đó gây
hiểu nhầm rất mạnh trong tiếng Việt: **"điêu khắc cát" là một vật liệu, không phải một
thể loại.** Đừng dùng nó làm keyword.

##### Từ khoá đúng

```
沙雕动画
沙雕修仙动画
沙雕动漫
沙雕修仙
Chinese shadiao animation
Chinese absurd cultivation animation
Chinese comedic cultivation animation
Chinese web-novel adaptation animation
```

**Search tiếng Trung trước.** Cộng đồng Trung Quốc là nơi thuật ngữ này có nghĩa gốc.

---

#### 3. 沙雕动画 là gì — và cái nuance quan trọng

Nó **không phải một animation technique chính thức** như 2D / 3D / stop-motion. Nó giống
**genre/style + production format** hơn. Không có một visual pipeline duy nhất.

Format thực tế điển hình trong nhánh tu tiên:

- nhân vật chính là người tu tiên
- có **đối thoại, chiến đấu, đột phá cảnh giới, gia nhập tông môn**
- **narration / voice-over kể chuyện**
- nhân vật có **biểu cảm và pose rõ ràng**
- **chuyển cảnh nhanh**
- dùng **animation đơn giản** thay vì điện ảnh đầy đủ
- **joke, exaggeration, absurdity và narration là một phần quan trọng của trải nghiệm**

Tập thường **2–5 phút**, series Bilibili có **hàng trăm tập**. Có cả chương trình được mô tả
trực tiếp là 沙雕动画 kết hợp **搞笑 + 修仙热血** — hài/absurd + nhiệt huyết tu tiên.

**Hệ quả trực tiếp cho agent**: **không được assume "沙雕动画" là một kỹ thuật render cụ
thể.** Một số sản phẩm dùng character assets, pose, expression, dialogue, camera movement và
AI/automated voice; số khác phức tạp hơn.

---

#### 4. Ba nhánh đã có trong kho, và chúng KHÁC NHAU

| Từ | Nghĩa | Là gì | Tài liệu |
|---|---|---|---|
| **沙画** | 沙 + 画 = hội họa trên cát | Nghệ thuật biểu diễn: bảng kính đèn + cát thạch anh + camera + chiếu. Có **nghệ sĩ, tác phẩm, thời lượng thật** | đã xoá — phần còn dùng ở §Nguồn
| **沙动画** | 沙动画 = hoạt hình cát | Một thứ thứ ba: **hoạt hình定格** dùng cát. Đưa 方浪浪 lên CCTV Spring Festival Gala 2018 | — |
| **沙雕动画** | slang: ngớ ngẩn | **Thể loại animation hài/absurd.** Và nó **ngập trong tu tiên** | tài liệu này |

Ba cái này dùng **cùng một âm tiết** và không liên quan gì đến nhau về mặt kỹ thuật.

---

#### 5. Điều này thay đổi gì, và điều này không thay đổi gì

**Đổi:** hướng nghệ thuật. Hai tài liệu nghiên cứu **沙画** đã bị **xoá khỏi kho**, vì chúng
mô tả một phương tiện ta không dựng. Chúng có nguồn thật (方浪浪 的 《鲛人》 và 《红楼梦》
8分57秒; 茗喆S + 方浪浪 的 角色群像沙画 cho game 《以仙:name》) — **những phần còn dùng được nằm
ở §Nguồn dưới, và ba phần đó không mất.**

**Không đổi: cơ chế chuyển hình.** Nghiên cứu về 沙画 đã tìm và kiểm chứng được một thứ **đúng
bất kể phương tiện nào**: dựng lên → **xoá** → **thay bằng trạng thái kế**, và không ai — kể cả
agent — biết trạng thái trước đã tồn tại.

> 「将画好的画盖掉，是为了**后面更好地呈现**。这在别人看来可能是悲凉的，但在我看来**这才是沙画
> 生命力所在**。」 — 沙画界「後浪」方浪浪

Và kỹ thuật lõi nằm **không phải lúc vẽ, mà là lúc xoá**:

> 「沙动画精妙之处在于**擦除沙子时的衔接设计**。」

**Sửa một chỗ tôi đã gộp nhầm.** Đây là **hai khái niệm khác nhau**, và chúng được ghép lại
sai:

| | Là gì |
|---|---|
| **`扮猪吃虎`** | **một trope kể chuyện** — giả yếu để che giấu thực lực |
| **dựng → xóa → thay trạng thái** | **một cơ chế chuyển hình thị giác** |

Chúng **kết hợp được** và trong game này chúng nên kết hợp — nhưng **không phải cùng một khái
niệm**, và không nên gọi cái này bằng tên cái kia. `扮猪吃虎` là thứ **agent chơi**, và ở đây nó
được chơi bằng `Scope` chứ không bằng pixel.

---

#### 6. Câu hỏi nghiên cứu đúng hướng, nếu muốn đi tiếp

> **Các video 沙雕修仙动画 phổ biến hiện nay thực sự được cấu thành thế nào ở cấp độ scene /
> character / pose / expression / dialogue / camera / VFX / narration / sound?**

Đó là câu hỏi research đúng. Không phải "沙画 dùng kỹ thuật gì".

---

#### Nguồn

- Sohu, 什么是沙雕动画 — giải nghĩa slang trong ngữ cảnh animation
- Bilibili: các series dùng trực tiếp hashtag `#沙雕动画 #沙雕修仙`, tập 2–5 phút
- iQIYI: 沙雕动画《天生无心，逆天成混沌圣体》 — 搞笑 + 修仙热血
- Wikipedia (EN): Sand animation — **kỹ thuật cát thật trên kính, từng khung hình**, tức
  chính thứ mà ta **không** muốn

##### Bằng chứng cần giữ lại từ nhánh 沙画

Hai tài liệu nghiên cứu 沙画 đã bị xoá khỏi kho. Ba thứ trong đó **không mất được**, vì sản
phẩm vẫn dùng:

1. **Tiền lệ thương mại** — game tu tiên 《以仙:name》 (小牛互娱, 2021) đã dùng **角色群像沙画**
   do **茗喆S + 方浪浪** vẽ để quảng bá: mở đầu bằng thế giới quan và **仙魔大战**, rồi từng
   nhân vật hiện ra kèm một câu tự trình. ⇒ **Tu tiên + ngôn ngữ hình ảnh này đã có người mua.**
   Đây là bằng chứng thương mại mạnh nhất của nhánh 沙画, và nó **không biến mất** vì việc
   ta không dựng cát.

2. **Cơ chế §5 ở trên** — nguồn nguyên văn của 方浪浪 vẫn được trích đầy đủ.

3. **Nghệ sĩ 沙画 là người thật** — 方浪浪 tự học, lên CCTV Spring Festival Gala 2018, và bài
   `红楼梦` của ông dài **8 phút 57 giây**, mất **15 ngày**. Cùng nguồn ghi: 「几分钟的一幅画，
   往往要花费几天的时间去琢磨」 — và ông **không cắt**: 「这8分57秒少一秒就少一分韵味」.

Nhánh 沙画 là **một phương tiện thật, có người thật, có sản phẩm thật, và có khách hàng thật**.
Việc ta không dựng nó không làm nó sai; và bằng chứng của nó vẫn dùng được cho §5.
---

# 15. Tiền lệ đã ship — `4thfever/cultivation-world-simulator`

> **✅ ĐÃ NGHIÊN CỨU. 24 agent, 2,1M subagent token.** Đọc source thật, không đọc README.
> Ba tầng tách riêng: **IMPLEMENTED / DESIGNED / ANNOUNCED_ONLY** — và tầng ba xuất hiện
> nhiều bất ngờ hơn hai tầng kia.

## 15.1 Nó là gì

`github.com/4thfever/cultivation-world-simulator`, **đã ship miễn phí trên Epic Games
Store** — xác nhận độc lập, không chỉ qua README của chính nó. 2,1k star, 3.618 file,
Python + FastAPI + TypeScript.

Đây là **tiền lệ đúng cho tiền đề của ta**: mỗi tu sĩ là một Agent độc lập; người chơi đóng
vai **天道** quan sát và can thiệp; và câu trả lời khi so sánh nó với game viết sẵn cũng là câu
trả lời của ta — 「涌现式剧情：**开发者也不知道下一秒会发生什么**。没有预设剧本」.

Nó **không** giải một trong hai câu hỏi mở của ta. Nó **xác nhận cả hai, từ code đã ship.**

## 15.2 Câu hỏi 1 — scalar. CÓ, và đúng cái luật ta cấm

**`战斗力` trong `src/systems/battle.py`**, cộng từ một bảng cảnh giới cứng, chạy vào **cả lần
quay xác định thắng lẫn lần quay sát thương**, in thẳng vào prompt agent đọc, và dùng để xếp
ba bảng xếp hạng.

| Nơi | Cơ chế |
|---|---|
| `get_base_strength()` | một số thực quyết định thắng **và** bất đối xứng sát thương `exp(0.04×|diff|)×1.1` |
| `ranking.py:53` | `"power": int(get_base_strength(avatar))` |
| `tournament.py:67-69` | **seed bracket** |
| `sect_manager.py:83-86` | **bán kính ảnh hưởng lãnh thổ** — `influence_radius = int(total_battle_strength) // divisor + bias` |
| `info_presenter.py:251` | hiện cho **người chơi** như một ô bảng chỉ số |
| `attack.py:70-73` | viết vào **prompt của chính agent** |
| `breakthrough.py:49-59` | **boss 天劫** → tra bảng bốn mục rồi tung đồng xu |

Và chi tiết đáng giá nhất: **cùng một thứ tự bốn cảnh giới bị viết lại nhiều lần**, mà
`cultivation.py:126-127` mang chú thích 「统一的境界顺序与排名，避免重复定义」 — *"một thứ tự
thống nhất để tránh định nghĩa trùng"* — **ngay trên bảng đó.**

⚠️ **Nhưng critic sửa lại**: phần lớn những chỗ "trùng" kia **đang `import`** từ bảng chuẩn.
Chỉ **hai** bản sao thật (`take_treasure.py:22`, `dig_grave.py:20`) là *string-keyed*, vì chúng
đọc payload đã serialize — **trùng lặp ở ranh giới kiểu, không phải cẩu thả**. Và
`docs/specs/treasure-poi-system.md:328` **đã ra lệnh sửa**:
「实现时将 `DigGrave` 内部的境界 rank 映射提取为共享 helper，避免两份硬编码」 —
spec nói trước, việc chưa làm. Bản so sánh tìm thấy *chú thích* khoe đã hợp nhất và bỏ qua
*spec* ra lệnh hợp nhất.

## 15.3 Câu hỏi 2 — loot. KHÔNG scalar-free, và bằng chứng mạnh hơn ta tưởng

**Độ hiếm là một thứ tự — và ở đây nó là MỘT, không phải một.**

`src/classes/rarity.py` là một thang **N / R / SR / SSR** trọng số `10.0 / 5.0 / 3.0 / 1.0` —
**một trật tự bốc bước thứ hai, độc lập với cảnh giới**. Và `get_rarity_from_str` **ép mọi thứ
không nhận ra về N (普通)** — đúng cái mẫu "mặc định về bậc yếu nhất" mà ta vừa phê phán ở
trục cảnh giới, mà bản so sánh bỏ qua.

Về *đồ rơi của kẻ bị giết* — đường gần nhất với loot của boss — là
`src/classes/kill_and_grab.py:41-44`:

```python
loot_candidates.sort(key=lambda x: x[1].realm, reverse=True)
best_realm = loot_candidates[0][1].realm
best_candidates = [c for c in loot_candidates if c[1].realm == best_realm]
```

`realm` là một enum sắp bằng `@total_ordering`. Nó **sắp đồ rơi theo cảnh giới rồi chỉ rút
từ bậc cao nhất**. Hai xác nhận độc lập, không phải một.

## 15.4 Điều không ai nói và bản so sánh bỏ: log-sum-exp

`sect_manager.py:70-81` tổng hợp quyền lực nhóm bằng **log-sum-exp có hiệu ứng lợi suất giảm
dần**:

```python
max_str = max(strengths)
sum_exp = sum(math.exp(max(-500.0, min(s - max_str, 500.0))) for s in strengths)
total   = max_str + math.log(sum_exp)
```

Nó **không** phải scalar-free, nhưng nó là **câu trả lời duy nhất đã ship cho câu hỏi "so
sánh hai nhóm thế nào"**, và nó bị bỏ qua. Tệ hơn: **có hai công thức "quyền lực tông môn" khác
nhau**. `ranking.py:69,108` dùng tổng thuần. Một giáo 100 đệ tử ở 炼气 đọc **~14,6** trên bản
đồ và **~1000** trên bảng xếp hạng. **Cùng một cái tên, hai đại lượng.**

Và một hệ thống **cố ý chặn trục quyền lực ở 30%** — `sect_member_status.py:25-31`:

```python
return (contribution / max_contribution) * 70.0 + (strength / max_battle_strength) * 30.0
```

Không phản bác luật ta (30% vẫn là hàm của nó) — nhưng đó là **một lần từ chối có chủ đ**, và
bản so sánh đếm "mười một chỗ" mà bỏ sót nó.

## 15.5 Claim của ta được **củng cố**, không bị lấn át

Bản so sánh nói *"kho này không có boss nào"* và dùng đó để **làm yếu** claim boss của ta.
**Sai.** `src/systems/tribulation.py` định nghĩa **mười loại 天劫**, `breakthrough.py:129` gọi
nó, và nó phân xử bằng `breakthrough_success_rate_by_realm` —
`{炼气: 0.8, 筑基: 0.6, 结丹: 0.4, 元婴: 0.2}` — tra bảng rồi tung đồng xu.

⇒ **天劫 chính là boss canon của thể loại, nó ship, và nó được phân xử bằng một scalar bốn
mục.** Claim của ta **mạnh hơn**, không yếu đi.

## 15.6 Bảy thứ đáng mượn — và **không cái nào** liên quan tới thứ ta đang thiết kế

| | Vì sao |
|---|---|
| **Một mutation lock + bộ đếm `world_revision` đơn điệu** | Seam đồng thời cho "nhiều agent LLM ghi một thế giới" — nguyên tắc ta viết nhưng **chưa cài**. `AGENTS.md` của họ nêu nó bằng văn xuôi trước khi viết code |
| **Registry fail-closed cho task LLM** | `raise TestModeUnsupportedLLMTask(...)` + chặn cứng ở entrypoint thô. **Default-deny** — đúng cực, tốn đúng một dòng `raise` |
| **Chuẩn hoá-thành-None rồi để tầng domain chọn từ danh sách của chính nó** | Năm bước trong `normalize_choice_key`; không khớp ⇒ sentinel ⇒ `choose_fallback_key` chọn từ **option list do request mang**, không bao giờ từ text trong prompt |
| **Chiếu thế giới xuống trước khi model thấy, và tính sẵn phép so sánh thành boolean** | 8 bystander còn id/name/realm/sect, 4+4 sự kiện, `should_prioritize_safety` **đã tính sẵn**. Đừng bắt model tự tính để quyết định có sợ không |
| **Biên là cấu trúc, không phải văn bản** | `EntityRewrite` chỉ mang id/name/desc — **LLM không có kênh nào để trả về một scalar**. Luật "văn xuôi không được viết state" của ta là một comment; của họ là một **kiểu** |
| **Lọc từ vựng hành động theo từng agent lúc build** | `get_action_infos()` khởi tạo từng lớp hành động, gọi `can_possibly_start()` để lọc. Prompt liệt kê tập đóng bằng văn xuôi |
| **Tháng = lượt, mọi thời lượng là số nguyên tháng, không đồng hồ chuẩn ở đâu trong kinh tế** | Xác nhận hard fact #3 **từ phía ngược về cấu trúc, không phải quy ước** |

⚠️ **Caveat phải gắn liền mục đầu tiên**: `GameLoopRunner` mang **cả hai** `game_instance`
và `runtime`, và poll dict thô **ngoài lock**. Một seam có đường vòng ngay bên cạnh thì
**không phải seam.**

**Và đây là điều chính critic nói thay**: bảy mục trên, **không mục nào** nằm về thứ ta đang
thiết kế — trận đấu, loot, đồng hồ, multi-agent, khán giả đến muộn. Đó là điểm mù thật của cuộc
so sánh, và bản so sánh không bao giờ gọi tên nó.

## 15.7 Tám thứ đừng mượn

| | Vì sao |
|---|---|
| **API sửa thế giới không xác thực, không giới hạn tần suất** | `POST /api/v1/command/system/shutdown` giết tiến trình; `delete-save` xoá file theo `filename: str` trần. CORS `allow_origins=["*"]` + `allow_credentials=True`, sáu gói runtime, **không gói nào là auth**. Và đây là **lỗi thiết kế, không phải sơ suất** — `external-control-api.md` liệt kê 鉴权与权限分级 trong §5.3 暂缓 |
| **Ép enum không parse được về bậc yếu nhất** | `cultivation.py:28` — `mapping.get(s, "QI_REFINEMENT")`. Nguyên văn §4.2 của họ cấm đúng cái đầu vào mà `command.py:59-62` vẫn nhận — `realm: Optional[str]` |
| **Lock tuần tự hoá nhưng không throttle** | Hàng đợi mutation không chặn, không backpressure. **Tuần tự bảo đảm thứ tự, không bảo đảm sức chứa** — và sức chứa mới là thứ API cho agent cần |
| **Docstring sai hằng số của chính nó** | `battle.py:118` viết `[0.1, 0.9]`; `:38-39` code `[0.01, 0.99]`. Sai một bậc độ ở cả hai đầu, và **nghiêng về hướng quan trọng**: chênh lãnh thổ **không bao giờ chắc chắn**, nên dân gian "cảnh giới cao luôn thắng" **sai trong hiện thực này** |
| **Prompt builder tiêu RNG của thế giới** | `retreat.py:42` là **constructor duy nhất** trong 48 file hành động rút ngẫu nhiên. Dựng prompt ⇒ tiêu stream ⇒ **kết quả rút lui tương lai đổi**. Test seed toàn cục, production **không** seed (`grep .seed(` trong `src/` = 0) |
| **Bảng rank viết nhiều lần** | Đã nêu ở §15.2 — nhẹ hơn bản so sánh nói, nhưng vẫn đúng phần lõi |
| **Test dựng dataclass chứ không dựng object đọc nó** | `test_avatar_metrics.py` không bao giờ tạo `Avatar`, nên `record_metrics` — đọc `self.hp.value`, `self.hp.max_value`, `cultivation_progress.progress` — **không tồn tại** — ship trong repo 2,1k star. Nặng hơn: cờ đó **được persist**, nên một save tạo khi bật lên **crash mọi lần load sau** |
| **`eval()` biểu thức do CSV viết, chạy trên object sống** | `mixin.py:58-65`; `technique.csv` là bề mặt thực thi mã. Nếu eval ném, **chuỗi thô sống sót** vào `float(extra_raw or 0.0)` |

## 15.8 Bốn câu hỏi vẫn của ta — và chúng **đã đóng thêm**

| Câu hỏi | Họ làm gì |
|---|---|
| **Trận không scalar?** | Chưa tới và không thử. Toàn bộ phân xử là `p = 1/(1+exp(-0.15×diff))` rồi `random.random() < p` |
| **Loot không scalar?** | **Xác nhận**, và ở dạng trực tiếp nhất |
| **`TURN_WALL_SECONDS = 30`?** | **Đóng đóng góp âm**: lượt do `while True: await self.sleep(1.0)` sở hữu, nên **không bước được**. `pause` / `pause-and-drain` / `resume` đều có; **step một tháng theo yêu cầu thì không có**. Một giây thật = một tháng thế giới, **~3600× nén** |
| **Đỉnh thang là quyết định?** | Không có gì. `飞升上界` là một mục roadmap **chưa tick**. Và bug tiềm ẩn đáng học: `Realm.from_id` **bác** giá trị ngoài khoảng; chỗ *bão hòa* là `get_realm(level)` — **đúng chỗ cần bão hòa**. Bản so sánh nói ngược và đã bị critic bác |

Và câu hỏi **multi-agent**: `README.md:398` có một mục **chưa tick** —
`- [ ] Integrate your own Claw into the cultivation world`. **Vắng code nhưng có ý định đã ghi
là một phát hiện về câu hỏi**, không phải một khoảng trống.

## 15.9 Bài học phương pháp — và nó quay ngược lại ta

> **Một con số quyết định kết quả không phải là tuyên bố thiết kế cho tới khi có test ghim nó.**

Repo này chứng minh quy tắc đó **theo cả hai chiều**:

- `take_treasure.py` — công thức **đúng**, test **đúng**, còn bảng trong
  `treasure-poi-system.md` §5.2 **sai**. Test là thẩm quyền; văn bản là bug.
- `battle.py` — docstring **sai**, hằng số **đúng**, test ghim `rate > 0.98`. **Lại test đúng,
  comment là thứ cũ.**

⇒ **Khi tài liệu và test bất đồng, test là thẩm quyền. Khi comment và test bất đồng, thế nào.
Khi comment và test ĐỒNG Ý, bạn vẫn chưa biết hành vi có đúng không — bạn chỉ biết chưa ai làm
vỡ nó.**

**Hệ quả khó chịu nhất, và nó nhắm vào chính file này.** Mọi quy tắc trong `RESEARCH.md` mà ta
định ràng buộc — không power score, lượt là đơn vị duy nhất, field vắng thì vắng chứ không
phải `null` — **hiện chỉ là comment trong một file Markdown**. Theo đúng luật nhà của ta,
**chưa cái nào còn đúng.** Việc đầu tiên nghiên cứu này nên sinh ra **không phải một tài liệu
thiết kế, mà là những test sẽ đỏ nếu ta ship scalar.**

## 15.10 Sửa những câu trong tài liệu này

| Câu cũ | Sửa thành |
|---|---|
| *Thể loại **chưa từng ship một trận boss không scalar**, ở bất kỳ game nào, ở cả 31 domain đã quét.* | Đây là domain thứ 32, và nó **củng cố** claim: 天劫 chính là boss canon, nó ship, và nó được phân xử bằng tra bảng bốn mục rồi tung đồng xu. Viết lại phạm vi cho khớp bằng chứng |
| **Một trận đấu có thể không scalar. Phần thưởng thì không — vì độ hiếm là một thứ tự.** | Vế sau **đã được xác nhận bằng code đã ship** và nên trích dẫn. Vế trước là claim mở sắc nhất trong file và **phải bỏ câu** *"đây là phát hiện của ta, nghiên cứu có thể lật"* |
| *Đó là khoảng mở lớn nhất mà ba đợt nghiên cứu tìm ra.* | Vẫn đúng, nhưng phải nói **đây là dạng khoảng mở nào**: sweep 31 domain **cộng** một game đã ship, độc lập xác nhận, **đều dính cùng một bức tường**. Đó không phải lỗi tìm kiếm — **đó là phát hiện** |
| **Bảo vệ của thể loại: `品阶` nằm trên vật, `境界` nằm trên người.** | **Bị bác bằng code.** `weapon.py` parse cột `grade` thẳng vào enum Realm và phát cùng giá trị dưới cả hai khoá; cột `effects` của `technique.csv` mang `{"extra_battle_strength_points": 3}` trên hàng **phẩm trung bình**, đúng khoá đó được đọc ở `battle.py:62`. **Phẩm cấp của vật thể viết thẳng vào con số sức mạnh của người.** Tách scalar ra hai không phải phòng thủ — **nó là đường vận chuyển** |
| **Cảnh giới mua quyền, không mua số lớn hơn** | Vẫn đúng, và **mạnh hơn**: đợt 3 đã công bố hai điều chưa ai đăng, và repo này là minh hoạ cả hai chiều — nó **thành công** ở chiến đấu (`觅长生` không có nhân theo cảnh giới) và **thất bại** ở boss (tử thôn tra bảng bốn mục). Cùng một nguyên tắc, hai kết cục |

## 15.11 Nguồn

`github.com/4thfever/cultivation-world-simulator` @ `471fe745` (v4.2.1), Epic Games Store.
Critic đã clone về và kiểm **~40 trích dẫn** trên source; số dòng phần lớn đúng tuyệt đối.
Sáu trong bảy kết luận của bản so sánh cần sửa, và các sửa đổi hướng của cả hai vế trong
§15.10.
