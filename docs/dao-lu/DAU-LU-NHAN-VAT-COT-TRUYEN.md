# ĐẠO LỘ: VẠN TIÊN — Nhân vật & Cốt truyện

Bổ sung phần còn thiếu của GDD: hệ thống đã có trong bản nháp, cái còn thiếu là
**người** và **chuyện**. Mỗi quyết định dưới đây đều dựa trên research, và nguồn
được ghi lại để kiểm được.

---

## 0. Bốn quyết định chốt trước, để trao đổi cho xong

Bản nháp hỏi 4 câu. Đây là chọn của tôi, kèm lý do — bạn đảo được nếu không đồng ý.

| | Chọn | Vì sao |
|---|---|---|
| **Combat** | **Real-time có tạm dừng chiến thuật** (kiểu ACS) | Turn-based cần AI đối thủ giỏi; đây là chỗ dễ hỏng nhất khi làm indie một mình. Real-time + pause để bạn ra lệnh giải quyết bằng ý mình, không bằng AI |
| **Nền tảng** | **PC / Steam** | Mobile cần UI riêng hoàn toàn; web thì performance giật với đám đông đệ tử |
| **Quy mô** | **Indie, vertical slice** | Bản nháp đã đúng khi chốt cái này |
| **Trọng tâm** | **Cốt truyện + xây tông môn** | Research: game tu tiên thắng ở *emergent story*, thua ở *combat complexity* |

---

## 1. Nhân vật

### 1.1 Chu Chính Vân (朱真昀) — nhân vật chính, 17 tuổi, ngoại đệ tử

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

### 1.2 Hạ Trúc Vi (夏竹筠) — 16, đệ tử luyện đan, linh căn tệ nhất môn

**Biết:** luyện đan. Không đọc được cấp kinh — chữ trong sách công pháp là chữ cổ.

**Muốn:** được coi là người, không phải công cụ.

**Vai trò thật:** cô là người **duy nhất** đọc được mấy trang ghi chép của sư phụ.
Nhân vật chính không đọc được sách — cậu giỏi đánh nhaung và đốt cháy cháy.

Đây là trao đổi công bằng của chương 1: **kỹ năng quý giá nhất nằm ở người tưởng
vô dụng nhất.** Nó cũng là câu trả lời cho lỗi thiết kế đã được ghi nhận của
*Amazing Cultivation Simulator*: "inner disciples cannot perform outer tasks, leading to
frustrating gameplay" — ở đây chúng ta **ép** người giỏi việc A phải cần người giỏi việc
B.

### 1.3 Diệp Hoài Ẩn (葉懷隱) — chưởng môn, chết hay sống: **bí ấn trung tâm**

Không xuất hiện. Chỉ qua **mấy trang ghi chép** — và ghi chép **không đầy đủ**, vì
ông viết dở rồi bị bắt quảng.

Ông là người duy nhất biết vì sao linh mạch dưới lòng đất đang cạn. Ông không kịp
nói. Người chơi sẽ ghép manh mối từ chữ viết tay, từ cái ông giấu, từ cái ông
không giấu.

### 1.4 Tạ Chi Dã (謝知野) — **phản diện chương 1**, nội đệ tử cùng khóa

Cậu mang **nửa thật** của sách công pháp. Cậu không phải ác nhân — cậu sợ.

**Muốn:** sống sót. Tông môn lớn có tài nguyên, có người che chở, có đường đột phá.
Tông môn chết thì chỉ còn một đệ tử chạy trên núi với nửa cuốn sách.

**Điểm gãy:** cậu đã cầu cứu một lần, và Diệp Hoài Ẩn **không trả lời**.

Đây là lựa chọn thiết kế có chủ đích: phản diện chương 1 **không phải kẻ ác**, mà là
người đã đưa ra quyết định hợp lý trong hoàn cảnh tệ.

### 1.5 Vạn Nhược Hoa (萬若華) — phản diện lớn, xuất hiện từ chương 3

Lão tu của **Thanh Liên Tông**. Đại tu sĩ Kim Đan.

Ông tin rằng linh mạch thiên địa đang cạn, và rằng **gom về một chỗ trước khi cạn hẳn
là hành động hợp lý nhất**. Ông không gây ra đêm Thanh Vân Sơn sụp — ông **quyết định
không cảnh báo**.

> Đừng để ông thành kẻ cười mặc râu mép. Ở chương 3, người chơi sẽ gặp một đệ tử của
> ông tử vì **cứu** dân trong một trận đánh yêu thú do ông sai đi.

### 1.6 Mộ Dung (墨鴻) — người dẫn đường, 70 tuổi, hái thuốc

Thật ra là **kẻ trốn truy nã** từ một tông môn đã bị xoá. Ông dạy **sinh tồn**, không
dạy tu luyện: kiếm ẩn, uống nước sao cho sống, không để lộ.

Vì sao có ông: cần một người lớn tuổi chỉ cho cậu bé **không phải thầy giáo**. Đệ tử
đệ tử nuôi dưỡng nhau không đủ; người chỉ đường phải là người chưa từng thuộc về đâu.

### 1.7 Bảng quan hệ

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

## 2. Cốt truyện chương 1: **Ba Ngày**

Tên chương là **thời gian** Chính Vân vắng mặt. Nó là đồng hồ đếm ngược của cả chương.

### Hồi 1 — Dưới núi (ngày 1)

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

### Hồi 2 — Chợ Thanh Hà (ngày 2)

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

### Hồi 3 — Vạn Dược Cốc (ngày 3)

Đuổi theo dấu Tạ Chi Dã. Đây là **bí cảnh đầu tiên**.

- 4 quái: 2 yêu thú, 1 **thú dược** (canh linh dược ở Vạn Dược Cốc)
- Thú dược **không phải là boss** — nó **giữ** thứ bạn cần, và giữ nó cho tới khi bạn
  đủ sức
- Dấu chân của Tạ Chi Dã dẫn vào một **hang đá bỏ hoang**, không phải tông môn lớn
- Chạm trán. Không đánh nhau. Cậu ấy nói:

> *"Sư phụ không trả lời. Cậu biết vì sao không? Vì ông ta cũng không biết."*

### Kết chương — ngày 4, sáng

Ba lựa chọn, **chưa giải quyết**, chỉ gieo hạt:

1. **Đi tìm sư phụ** — bỏ tông môn, đi theo manh mối
2. **Ở lại dựng** — bỏ bí mấp, giữ ba đệ tử
3. **Bán sách cho Vạn Nhược Hoa** — đổi tài nguyên lấy an toàn, và biết mình đã bán

Lựa chọn 3 **không bị phán xét** bởi hệ thống. Không có morality meter. Chỉ có hậu quả.

---

## 3. Ba tuyến, gieo sớm

Bản nháp đã có 3 tuyến. Chúng **không được chọn bằng menu** — chúng chỉ lộ ra qua lựa
chọn cụ thể:

| Tuyến | Lộ ra khi | Ví dụ |
|---|---|---|
| **Chính Đạo** | chọn 2 ở kết chương, và giữ lái buôn thành | giữ cả ba, và giữ cả tên Thanh Vân |
| **Tự Tại** | chọn 1, và **không** dùng sách làm vũ khí | đi một mình, tự mở đường |
| **Nghịch Thiên** | chọn 3 **và** đọc được trang cuối sách | thấy điều mà sư phụ giấu |

Trang cuối sách là **thứ duy nhất** mở tuyến 3. Người chơi phải **tìm ra** nó.

---

## 4. Những gì research cho thấy phải tránh

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

## 5. Danh sách nhân vật — rút gọn còn 7

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

## Nguồn

- **Cấu trúc cốt truyện**: *斗破苍穹* (điển tích — giá trị bị đọc sai, danh tiếng là
  đường tiến triển), *凡人修仙传* (thận trọng, kỷ luật tài nguyên)
- **Thiết kế game**: *Amazing Cultivation Simulator* (vòng lặp tốt, AI + micromanagement
  + tutorial hỏng), *Wondering Sword*, *Tale of Immortal*, *The Scroll of Taiwu*
- **Hệ cảnh giới**: hướng dẫn 10 giai đoạn phổ biến cho tiểu thuyết tu tiên
- **Về việc cốt truyện bị bỏ**: Mitchell, Kway & Lee, *Storygameness* — người chơi
  bỏ cốt truyện khi hiểu hệ thống đủ để không cần nó nữa
