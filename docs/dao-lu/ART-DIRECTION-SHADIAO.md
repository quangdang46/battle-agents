# Hướng nghệ thuật — 沙雕修仙动画

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

## 1. Hướng

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

## 2. Cơ chế chuyển hình — thứ độc lập với phương tiện

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

## 3. Câu hỏi nghiên cứu

> **Các video 沙雕修仙动画 / 沙雕漫 phổ biến hiện nay thực sự được cấu thành thế nào ở cấp độ
> scene / character / pose / expression / dialogue / camera / VFX / narration / sound?**

**Không** hỏi "làm animation cát thế nào". Đó là câu hỏi sai và nó dẫn vào ngõ cụt.

### Cây breakdown cần lấp

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

## 4. Hệ sinh thái cần map

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

## 5. Corpus tiểu thuyết — ràng buộc pháp lý, đọc trước khi tải gì

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

## 6. Ba lớp corpus

Không gọi chung tất cả là "tiểu thuyết tu tiên". Ba lớp trả lời ba câu khác nhau.

### Lớp A — canonical tu tiên
Lấy **bộ giọng** và **vốn từ**.

| Tác phẩm | Vì sao |
|---|---|
| **凡人修仙传** (忘语) | Mẫu rõ nhất của `凡人流`. Nhân vật sống bằng **tính toán, tài nguyên, cảnh giác** — và nghiên cứu đợt 1 đã kết luận động cơ tính toán này **chuyển được sang agent**, còn động cơ cảm xúc của `斗破苍穹` thì không |
| **仙逆** (耳根) | Hệ tu luyện, cảnh giới, pháp bảo, tông môn, sư phụ |
| **一念永恒** (耳根) | **Quan trọng nhất cho 沙雕** — chính nguồn nhà xuất bản mô tả tác phẩm chuyển từ nghiêm túc sang **幽默诙谐**, tạo tình huống bất ngờ |
| **我欲封天** (耳根) | Tiến trình + power fantasy phóng đại |
| **烂柯棋缘** (真费事) | Cổ phong仙侠, yêu tinh, thần tiên — vốn từ thế giới |

### Lớp B — hài / absurd
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

### Lớp C — shadiao-animation
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

## 7. Điều chưa biết, và không nên đoán

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

## Nguồn

- Sự phân tầng ba nhánh: `TERMINOLOGY-沙雕.md`
- Bằng chứng còn lại từ nghiên cứu 沙画: `TERMINOLOGY-沙雕.md` §Nguồn
- Danh sách hệ sinh thái: hai video Bilibili đã nêu ở §4 **[CHƯA truy cập]**
