# Tham chiếu hình ảnh: điêu khắc cát (沙畫)

> **CHƯA NGHIÊN CỨU.** Exa đã chạm trần rate limit khi tôi định tra chiều này. Phần
> dưới đây viết từ kiến thức của tôi, **không** phải từ nguồn tra được, và nó không
> có mức tin cậy như sáu mục trong `brief-raw.md`. Khi trần hạ reset, nó nên được tra
> lại — đặc biệt phần *"chuyển sang pixel art 2D"*, vì đó là chỗ tôi suy luận nhiều
> nhất.

---

## 1. Vì sao đây là ngôn ngữ hình ảnh đúng

沙画 — hội họa trên cát — là một **loại hình thức biểu diễn có mặt**: người biểu
diễn đứng trước màn hình kính, lấy cát màu, để đầu ngón tay xoay dòng cát thành
hình, rồi xoá. Không phải hoạt hình được vẽ sẵn — **hình ảnh bị tạo ra rồi bị
xoá trong cùng một hơi thở**.

Điều đó khớp với một game tu tiên theo ba cách, và không khớp với ba cách khác:

| Đặc điểm của điêu khắc cát | Vì sao khớp |
|---|---|
| **Hình mọc ra rồi tan** | Tu tiên là nguyên lý biến đổi. Cảnh giới, tâm trạng, đan dược — tất cả đều có hình thức rồi biến mất |
| **Một chất duy nhất** | Toàn bộ khung hình là **một vật liệu**. Đơn sắc, và sự giới hạn đó ép bạn dùng hình khối chứ không dùng chi tiết |
| **Người xem biết trước kẻ vẽ** | Khán giả nhìn thấy cát còn lại từ hình trước. Đó là 扮猪吃虎 được **diễn ra thị giác** |

Điểm thứ ba quan trọng nhất. 扮猪吃虎 (*bị lợn, hợp hổ*) — người đóng vai kẻ yếu để
người khác chủ quan thấy mình mạnh — vốn là kỹ thuật kể chuyện dựa trên việc **người
đọc biết điều người đọc không nên biết**. Trong hình thức này, khoảnh khắc cát bị
xóa **chính là** khoảng trống mà người xem điền vào.

---

## 2. Ngôn ngữ hình ảnh, cụ thể

### Bảng màu

- **Nền**: một màu duy nhất, thường tối hoặc trung tính. Không có bối cảnh.
- **Dải**: ba đến năm sắc, ấm trên lạnh dưới. Nóng (đỏ, cam, vàng) cho **cảnh
  giới thấp và lửa**; lạnh (xanh, tím, xanh tro) cho **đột phá và tâm ma**
- **Tương phản mang nghĩa**: đỏ không phải "nguy hiểm" mà là **tu vi**; tím là **tâm
  ma**; trắng là **linh khí**. Màu là trạng thái, không phải trang trí

### Chuyển độ

Ba nhịp, và cả ba đều là **chuyển động của tay**, không phải của vật thể:

1. **Rò ra** — cát chảy ra ngoài viền hình, và đó là thứ làm hình trông sống
2. **Xoá** — ngón tay quét ngược, và hình **tan theo chiều rò ra**
3. **Cầm lại** — cát vẫn còn trong lòng bàn tay, và có thể vẽ lại thành hình khác

Nhịp thứ ba là nhịp kể chuyện: **cái đã xoá không mất, nó chờ**. Đó là lý do điêu
khắc cát hợp với tu tiân hơn là hoạt hình thông thường — trong tu tiên, thứ bị phá
hủy luôn là nguồn.

### Quy mô

Một màn hình, **một cùng trai**. Không có góc quét, không có thế giới rộng. Người
xem ở một khoảng cách cố định, và bố cục phải đọc được từ khoảng cách đó.

---

## 3. Chuyển sang pixel art top-down 2D — chỗ tôi suy luận nhiều nhất

Đây là chỗ tôi **ít tin nhất**. Ghi ra để kiểm, không phải để tin.

| Nguyên tắc của cát | Bản dịch pixel art | Rủi ro |
|---|---|---|
| Một chất duy nhất | **Bảng màu giới hạn, cố định cho cả game** | Dễ thành phẳng nếu giới hạn quá sớm |
| Rò ra rồi xoá | Nhân vật đi vào khu vực = **cọ vào cát**; rời đi = **quét sạch** | Rủi ro biến thành hiệu ứng hào nhoáng rỗng |
| Cát còn trong tay | Thứ đã phá **để lại dấu vết trên sàn** thay vì biến mất | Có thể thành nhiễu |
| Một màn hình | **Không cuộn vô hạn.** Một thị trấn, nhìn một lần | Xung đột trực tiếp với thiết kế infinite canvas hiện tại |
| Người xem biết trước | **Lớp phủ thứ hai** cho người xem, không cho agent | Đây chính là sửa đổi duy nhất mà critic nêu — và ở đây nó **có hình thức** |

Điểm cuối là chỗ tôi nghĩ thú vị nhất, và nó **khớp với chỉnh sửa của critic một
cách tình cờ**. Critic nói: để tầm nhìn theo người xem thành nguyên lý. Ngôn ngữ
cát **cho** ta hình thức hình ảnh của nó: một lớp cát mà người xem thấy và agent
không thấy. Trái tim của 扮猪吃虎 trở thành **một lớp phủ render**, và nó không cần
một cơ chế nào khác.

---

## 4. Điều này phủ định gì

Nếu ngôn ngữ cát là chuẩn, thì hai thứ trong thiết kế hiện tại phải đổi:

1. **Canvas vô hạn** — cát là **một màn hình**. Thành phố phải vừa một khung nhìn,
   nhiều nhất là hai. Vô hạn là quyết định của game isometric phương Tây, và nó trái
   nguyên tắc của hình thức này
2. **Mọi chi tiết vẽ được** — cỏ, hoa, đường, hoạt ứng. Ngôn ngữ cát phủ nhận:
   bố cục phải đọc được bằng **khối**, không bằng chi tiết

Cả hai đều là **hậu quả**, không phải lựa chọn sẵn có. Và cả hai đều đánh đổi với
những gì tôi đã làm ở game kia — nơi 3.890 PNG chi tiết là điều tốt.

Tôi **chưa quyết** điều này, và nó nên là câu hỏi đầu tiên bạn trả lời: *đây là
một game isometric chi tiết, hay một game bố cục đậm như tranh cát?*

---

## Nguồn

**Không có.** Mục này viết từ kiến thức, không phải từ tra cứu — xem hộp cảnh báo
đầu trang.
