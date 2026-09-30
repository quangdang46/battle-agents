# Calibration disproofs — the four negatives already known to be false

**Ngày: 2026-09-30.**

Critic của đợt 3 nói đúng một điều về chính nó: nó **không thể tái tạo** C2–C4 vì các phần bác bỏ
**không nằm trong repo**. Một phép kiểm chứng không có đối chứng thì không phải phép kiểm
chứng. Tài liệu này là đối chứng.

**Cách dùng:** trước khi tin bất kỳ audit negative nào, hãy thử tái tạo bốn cái này bằng phương
pháp nguồn thứ hai. Nếu tái tạo được, phương pháp đó có giá trị. Nếu không, mọi phán quyết khác
từ cùng phương pháp là nghi ngờ.

---

## C1 — `了不起的修仙模拟器` **CÓ** thang phẩm số cho trang bị · **ĐÃ BÁC BỎ**

**Claim sai:** *"ACS không có bậc số."*

**Nguyên văn wiki, mục `名词释义`:**

> 「品阶：道具的级别，**代表其稀有程度**」

Trang 炼器:

> 「**品阶决定法宝属性的浮动范围（最低下限和最高上限）**，品质决定在当前品阶范围内能发挥出多少百分比」

và `12阶的法宝为品阶上限`, cùng công thức đã công bố:

```
材料品阶² × 500 + 材料灵气 × 人物炼器品阶加成 = 炼成的法宝品阶² × 500
```

Ví dụ tính trong nguồn: `(72000 − 8²×500) ÷ 5 = 8000`.

**Vì sao claim sai:** nó đến từ việc **đọc một trang wiki LIỆT KÊ** mà bảng của trang đó tình
cờ không có cột 品阶 — và suy ra từ cột thiếu rằng thuộc tính không tồn tại. **Ba artefact dẻ
xuống trong đợt 2 được dựng trên suy luận đó.**

---

## C2 — Cấu trúc khắc phục ngũ hành **không chỉ** `梦幻西游` · **ĐÃ BÁC BỎ, HAI LẦN**

**Claim sai:** *"梦幻西游 một mình cho cấu trúc khắc phục."*

**(a)** `大话西游2`, tên miền chính thức `xy2.163.com`, bài 2016 — công thức và **ví dụ tính**:

```
最终伤害加成 = 1 + 40% × (施法方五行伤害加成 − 目标方五行伤害加成减免)
→ 1 + 0.4 × (0.29 − 0.19) = 1.04
```

cộng số hạng `强力克 = 强克% × 对方被克五行%`. Và **五行相克 là một chiều**: bị khắc không tốn
giảm nào.

**(b)** **ACS công bố một công thức KHÁC**: `单格风水值(t) = P_目标 + 2·P_生目标 − 2·P_克目标`,
kèm bảng chia sáu bậc.

**Điểm mạnh hơn cả bản bác bỏ đầu:** **hai công thức này không phải cùng một công thức.**

---

## C3 — Có kết cục chiến đấu **không chết thật** · **ĐÃ BÁC BỎ**

**Claim sai:** *"Không game tu tiên nào có kết cục không giết."*

`修仙家族模拟器2` 的 **心魔劫** có **hai** cách kết thúc — nguyên văn:

> 「心魔是可以被击杀的…可以快速击杀心魔或者抗过去（**扛过去需要五分钟**，会导致保护丹药失效）」

và nó chứa một **bản sao nhân vật phái sinh từ chỉ số của chính bạn**:

> 「他会复制本体的所有属性和技能并得到一定程度的加强」

Lượt chơi tối ưu, theo chính hướng dẫn: **「进去的时候别带…法宝 这样复制体就只会追着你a并且没有多少伤害」** — tức **bỏ hết kỹ năng công kích**.

**雷劫** là một trận sống sót **năm phút**, **không có tùy chọn giết**.

---

## C4 — Thất bại **không** phá hủy · **ĐÃ BÁC BỎ**

**Claim sai:** *"Thể loại không phá hủy vì một dịch vụ trực tiếp không dám làm người chơi khóc."*

`修仙修仙模拟器2` 的 雷劫 **hủy vĩnh viễn trang bị** — nguyên văn:

> 「雷劫在攻击玩家的时候，会对穿戴的装备、法宝造成损失，**会直接打落装备耐久上限，一旦耐久上限为0，则装备破碎无法修复**」

và khuyến nghị chính thức:

> 「渡劫时，建议**多备几套备用装备**、法宝以防不测」

Xác nhận trên 9game và trên một hướng dẫn 突破 độc lập thứ hai.

---

## Bốn phát hiện thêm từ đợt 3 — ghi vào đây để không mất

Đợt 3 thêm bốn cái nữa, không nằm trong bốn calibration case:

- **N2 — chấm hòa tất định theo trạng thái đã cam kết: ĐÃ CÓ, bằng bốn nguồn chính thức.**
  `九阴真经` chính thức: 「回合时间结束，双方均未死亡，则击打伤害量较高者获胜；**击打伤害量相同则记为平局」**.
  `梦幻西游手游` **đã bỏ** 战队指数 và thay bằng phán quyết ở lượt 51 bằng 「气血百分比总和」, cam kết 「X9联赛将再无平局情况」.
- **N10 — quy tắc tự động tướng ghế sau hai tuần offline: là GAME ĐÃ SHIP, từ 2016, trên
  trang chính thức của 完美世界** — không phải tiểu thuyết, và **không phải tự động chuyển
  tài sản.** Nó là kế nhiệm lãnh đạo, với điều kiện người kế nhiệm phải đăng nhập trong 10 ngày.
- **N7 — 仙人五衰 đã được biến thành lịch có thể lên kế hoạch**, trong thông báo chính thức
  của `一念逍遥`: trần 8000 tầng, mở khoá sau 50 kiếp, **cho phép đuổi 100 lượt thử**, trần
  10/ngày.
- **N13 — ngân sách chi trong chiến đấu đã có, chính thức**: `梦幻西游手游` 的 法宝灵力 bắt
  đầu 6 điểm, **+1 mỗi lượt**, trần 8, giá mỗi hành động 6/5/4, có chiết khấu theo 阴属性.

---

## Quy tắc rút ra

**Một negative không phải bằng chứng. Nó là một câu hỏi chưa ai hỏi cẩn thận.**

Khi 4/4 phản ví dụ đã biết đều **tái tạo được trong một lần tìm kiếm**, thì một negative
**sống sót** là bằng chứng yếu hơn một negative **gục**. Nhưng đó là mệnh đề hẹp:

> Một negative sống sót qua một lần tìm kiếm **mà lần tìm kiếm đó cũng tìm ra bốn cái biết-đúng**
> mạnh hơn một negative sống sót qua một lần tìm kiếm **không tìm ra gì**.

Và cơ chế có **vòng tròn**: tìm kiếm được **chọn bởi chính các negative nó đang kiểm tra**. Tìm
được C1–C4 chứng minh audit đã nhìn vào nơi mục tiêu của nó nằm. **Nó không chứng minh nó đã
nhìn vào nơi một negative chưa liệt kê sẽ nằm.**
