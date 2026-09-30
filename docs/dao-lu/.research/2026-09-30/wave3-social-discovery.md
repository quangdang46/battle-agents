# Đợt 3 — Gặp gỡ, tìm thấy và được tìm thấy

**Miền: 社交 好友 组队 匹配 撮合 世界 聊天 交易 玩家 相遇 修仙 多人**
**Ngày: 2026-09-30. Chỉ tìm bằng tiếng Trung.**

---

## 0. Kết luận một dòng

**Thể loại KHÔNG có một social matching primitive nào.** Cơ chế duy nhất đưa hai
người lạ vào tiếp xúc là **gõ chữ ở kênh thế giới** — và chính cái kênh đó đã được
một studio xác nhận chính thức là **điểm hỏng âm thầm** khiến người chơi không tìm
được bạn. Đợt trước gọi `圣魔之血` là một "danger list item"; báo cáo này **xác minh
được đầy đủ đặc tả** của nó, và nó tệ hơn dự đoán: có **hai cửa sổ 30 giây thật**.

---

## 1. Ba phát hiện làm đổi bài toán

### 1.1 `觅长生` — ván bài tham chiếu của đợt trước — là **single-player**

Steam store page (first-party, Chalcedony Network):
> 「也可以**和游戏中的角色互动**」…「与**游戏中的**任意角色**结交好友**相互论道、和对方**结为道侣**辅助双修」

Mọi từ quan hệ trên trang bán hàng đều chỉ NPC. Steam news announcement (2021)
mô tả trọn vẹn cái thang xã hội **thay thế cho người chơi**:

- **声望 7 bậc**: 誉满天下 → được `请教` bất truyền của mọi phe ở 宁州;
  声名远扬 → được `拜访` trưởng lão các môn phái để **结交论道**;
  âm thanh → các thành thị treo **thưởng**, tiền thưởng **tăng theo độ xấu**,
  sát thủ đến **mạnh dần theo thưởng**, và game **ngừng gửi sát thủ** khi rủi ro
  bị giết đã vượt tiền thưởng.
- **好感度** chặn `请教` (tu học) và **biến thiên theo chênh lệch cảnh giới** hai bên.
- **神识探查** NPC: phải có 神识 **cao hơn** họ, thăm dò hỏng **bị trừ điểm**.
- `秘市` (chợ đen) **bị nghỉ việc** — `"秘市正式退休了"` — vì `请教` đã thành đường chính.

Xã hội ngoài game của nó là **50 nhóm QQ chính thức**, đặt tên theo địa danh trong
game. Trong game: **0 cơ chế người-chơi-đối-với-người-chơi**.

> **Hệ quả cho thiết kế.** Đợt 2 khuyến nghị "realm mua quyền chứ không phải số
> lớn hơn" và gắn nó vào `觅长生`. **Không ai nhận ra đó là cùng một lựa chọn**: game
> đó đánh đổi cả hai. Ván bài mà đợt trước muốn học **chưa từng** đưa agent vào
> gặp agent. ⇒ *Cặp (permission-not-power) × (agent-to-agent meeting) chưa từng
> được ship cùng nhau. Đó là khoảng trống thật, không phải khoảng trống do tôi
> không tìm thấy.*

### 1.2 Studio lớn nhất thể loại **đã thử social và thất bại, rồi sửa bằng tắm**

`问剑长生` (雷霆游戏), 1 năm, ~5 triệu người đăng ký. Số do **chính nhà phát triển**
công bố tại họp báo (20/12/2025):

| Số | Đơn vị | Mẫu số |
|---|---|---|
| ~5.000.000 | tài khoản đăng ký | — |
| ~670.000 | 宗门 đã tạo | 5,0M người đăng ký |
| ~150.000 | **cặp** kết 道缘 | 500k→300k người / 5,0M ≈ **6%** |

Phát triển **tự thừa nhận**: `"在社交玩法上走了弯路"`. `破碎仙域` (tactical-survival PvP)
thất bại trên **cả hai trục**: `"既不够轻松有趣，也不够紧张刺激"`, quy trình
`"强操作、费时间"` xung đột với lõi đặt trước nhẹ.

Cách sửa (`问剑长生·轻遇`, đổi tên = **"gặp gỡ thuận"**):
- **聚仙城** — thành xã hội: **泡澡 (tắm)**, **刮刮乐 (cào thẻ)**, **擂台**, pháo hoa.
- Nguyên tắc ghi rõ: `"强操作类的社交玩法暂不纳入开发重点"` — **độ thao tác cao bị loại khỏi ưu tiên**.
- `"弱化玩家的'上班感'"`, không nhiệm vụ social bắt buộc.
- `聚仙城` **không gắn chặt vào tăng trưởng** (`不再和能力成长强绑定`).

### 1.3 Cùng studio đó **công bố tỉ lệ bể chứa** — và tỉ lệ nói ra câu chuyện

`致玩家信`, 01/04/2026 (厂商投稿). Sau khi người chơi phàn nàn chia bể khớp:

| Loại gameplay | Bể khớp | Lý do |
|---|---|---|
| 星墟 / 商会 / **聚仙城** | **16 区服** | "以社交、交易、合作等体验为主…保障社交生态" |
| 宗门联赛 / 诸天大会 / 位面争锋 | **8 区服** | "核心竞技与排行" |

**Bể social gấp đôi bể thi đấu.** Cùng tập người chơi, cùng tập server: nhóm cần
**mật độ dân cư** để có ai để gặp; nhóm thi đấu thì chính trận đấu là nội dung nên
chịu được quần thưa. Đây là con số **có thể trích, có ngày tháng, từ chính nhà phát
triển** — và nó là câu trả lời trực tiếp cho *"bể khớp phải rộng bao nhiêu để
gặp được nhau"*.

---

## 2. Nguyên nhân gốc: thể loại KHÔNG có matching primitive

Đã quét hết các đường. Không game tu tiên nào ship cơ chế **tự động ghép hai
người chưa từng gặp** ngoài hành lang thi đấu. Ba lối thoát thực tế:

### 2.1 Kênh thế giới — và nó đã **hỏng chính thức**, có sự việc, có ngày tháng

`凡人修仙传：人界篇`, diễn đàn TapTap **chính thức**, 10/01/2024. Người chơi:
> 「开局第一天被禁言，世界说话别人看不到，添加好友显示敏感字，**组队喊话也不可以**。
> 导致我们第一天**组不到人过205**，上报解决需要24小时…活动时间是48小时内。」
> 「**648都属于敏感词**」

Dev trả lời: `"敏感词问题已经有专人去解决，预计过年前会完成初步优化"`.

Đây là **bằng chứng first-party, có ngày** rằng **kênh tìm người chơi chính của thể
loại là điểm hỏng âm thầm**, và thiệt hại đo được là **không tìm được đội trong
cửa sổ sự kiện 48h**. Ba đặc tính cùng lúc: **miễn phí, phụ thuộc mạng, không kiểm
định được, và chết âm thầm**.

Và người chơi đã học cách lách: `"5人本速刷，1T3DPS1奶，来人！"`. Cơ chế gặp gỡ
bắt buộc người chơi **viết tiếng tắt nghĩa ngành trong bộ lọc đối kháng**. Với
agent, đó là **sinh văn bản tự do dưới bộ lọc đối kháng** — tệ nhất trong tất cả
các kiểu rủi ro.

### 2.2 `宗门` — nhưng đó là **lựa chọn đi vào**, không phải khớp

`一念逍遥` (吉比特/雷霆, first-party): `"宗门等级和宗门人数上限挂钩"` — cấp quyết
định trần người. Rời đi rồi vào lại phải chờ **30 phút**.

Cái làm `宗门` hoạt động không phải thành viên, mà là **hai cửa sổ 10 phút mỗi tuần**:
- `宗门道场`: **21:00–21:10, thứ Hai và thứ Năm**
- `镇魔深渊`: **09:00–09:10, thứ Ba và thứ Năm**

Mười phút. Toàn bộ tầng xã hội của thể loại được bọc trong hai cửa sổ đồng hồ 10
phút mỗi tuần, và chúng **không đợi nhau**. Đây là hình dạng nguy hiểm nhất trong
toàn bộ báo cáo: **cần phối hợp, cần đồng hồ, cần người khác cũng rảnh đúng lúc đó**.

> ⚠️ Bảng trần thành viên `1级20人…6级1000人` (jnw.cc) là **GUIDE_FARM tự thừa nhận
> không đáng tin**: `"以上数据为根据游戏版本整理的常规数值，实际以游戏内最新设定为准"`.
> Và bị **phủ định trực tiếp** bởi 3DM: `"11级宗门，灵气加成是22点"`. Bảng 6 cấp
> không thể đúng nếu game có 11 cấp. **Không dùng số nào trong bảng đó.**

### 2.3 Bảng `招募` — xuất hiện **rất muộn**, và bị giới hạn cứng

`灵兽大冒险`, thông báo chính thức 19/03/2026 — đặc tả đầy đủ nhất trong toàn bộ
tập dữ liệu:

| Ô | Giá trị |
|---|---|
| Số nhãn tối đa | **3** |
| Độ dài 宣言 tự do | **20 ký tự** |
| Thời hạn đăng | **7 ngày**, tự hạ |
| Gợi ý hệ thống | **theo độ gần mức** (`避免等级差距过大组队尴尬`) |
| Giao dịch liên server | mở theo **tuổi server**: ngày **109** / ngày **173** |
| Thuế liên server | **16%**, phí đăng **100w 银两** |

Đừng chờ tự do: 20 ký tự là **giới hạn cứng vào thứ tự chữ**, đúng thứ agent làm
tốt. Đây là khuôn mẫu tốt nhất mà thể loại đã chọn.

---

## 3. `圣魔之血` — xác minh đầy đủ. Nó tệ hơn cảnh báo.

Trang **chính thức** (`smzx.51uban.com`, 17/09/2019), mục 进阶玩法. Điều kiện cưới:

```
[1] 男女玩家必须均 ≥50级
[2] 男女玩家必须同处于 1 个家族内
[3] 男女玩家必须均未婚
[4] 男女玩家均拥有物品：丘比特之箭
丘比特之箭 = 10 亲吻卡 + 10 拥抱卡 + 10 依偎卡 + 1314 金  (可反复接取)
```

Rồi chuỗi nhiệm vụ — **đây là phần đáng sợ**:

```
双方均接取任务"拥抱" → 男女使用交互动作"拥抱" → BUFF 30 秒
  → 满 30s: 真爱之印：誓言
双方接取"亲吻"        → 男女使用交互动作"亲吻" → BUFF 30 秒
  → 满 30s: 真爱之印：永恒
```

Bốn ràng buộc chồng nhau trong **một** quan hệ bền vững nhất thể loại:

1. **Hai người, hai giới tính** — `Nature Human Behaviour 2025`: LLM hợp tác tệ
   và **không bao giờ hợp tác lại sau một lần phản bội**.
2. **Cùng một 家族** — phải là người đã quen.
3. **Hai cửa sổ 30 giây thật**, cả hai đều phải **chủ động thi hành một cử chỉ đồng
   thời**. Không có turn nào ở đây. Đây là **REQUIRES_REFLEX thuần**.
4. Chuỗi tiêu hao 1314 vàng phía trước.

Đợt trước ghi: "điều kiện hai người, hai giới tính, đã kết bạn — và đó phải vào
danger list". **Xác minh đúng, và bổ sung: còn hai đồng hồ 30 giây nữa.** Xếp vào
`REQUIRES_REFLEX` + `REQUIRES_COORDINATION`, không chỉ `REQUIRES_COORDINATION`.

### 3.1 Mẫu lặp: **mọi quan hệ bền vững trong thể loại đều kết thúc bằng đồng thời**

| Quan hệ | Điều kiện đồng thời | Nguồn |
|---|---|---|
| Cưới (`圣魔印`) | **phải là đội 2 người, không thêm ai**; phụ nữ bị đóng băng, nam phải hạ hết quái **không để cô nàng chết** | kanwenda (guide) |
| Cưới (`成吉思汗2`) | **cùng quốc, khoảng cách ≤ 10 mét**, bạn ≥1000, đội 2 không người thứ ba, **131两421文** | **麒麟游戏, first-party** |
| `师徒` 出师 (`梦幻西游`) | **双方组队, 师傅为队长**, đến `国子监祭酒` làm lễ | **NetEase, first-party** |
| `师徒` 出师 (`4399`/`聚仙`/`诛仙`) | **双方组队, 师傅为队长**, đến NPC `伯乐`/`陶丹青` | first-party |
| `师徒` 收徒 (`聚仙`) | **双方都在 NPC 附近** | first-party |

Không có quan hệ nào kết thúc bằng **chờ**. Cưới thì chờ đồng thời, xuất sư thì
chờ đồng thời, lập gia thì chờ đúng 10 phút mỗi tuần. **Đây là khuôn mẫu, không
phải tai nạn** — nên nó là rủi ro hệ thống, không phải lỗi triển khai.

---

## 4. `师徒` — nguyên thủy xã hội duy nhất không cần tự do

Đây là thứ lâu đời nhất và **nhất quán nhất** của thể loại. `GENRE_CANON`.

| Nguồn | Bậc thầm | Bậc đồ | **Đồng thời** | Nhịp giới hạn | Chênh cấp |
|---|---|---|---|---|---|
| 诛仙 (完美, 09/2009) | ≥105 | ≤75 | **7** | — | vùng chết 75–105 |
| 梦幻西游 (NetEase) | ≥61 | 15–45 | **3** | **1 本服 + 1 新手服 / tuần** | — |
| 梦幻新诛仙 (03/2023) | ≥60 | ≥25 | **2→4 + 2 亲传** | 传功 **1/ngày, 3/tuần** | — |
| 聚仙 | >50 | <50 | **5** | — | **≥10** |
| 4399 梦幻修仙 | ≥30 | 10–40 | **5** | **3 / 24h** | — |

Hình dạng chung: **5–7 đồng đồi, chênh ≥10 cấp, giới hạn nhịp theo tuần hoặc ngày,
xuất sư là hành lễ đồng thời.** Nó là quan hệ **dọc một-nhiều**, có cổng, không
cần tự do, không cần đàm phán. Với agent, đây là **quan hệ xã hội duy nhất trong
toàn bộ thể loại chạy được không cần viết một chữ**.

`聚仙` còn có điều khoản phá vỡ một phía: nếu đệ tử **không上线 trong 7 ngày** thì
không phạt; nếu **có上线** thì thầy **3 ngày không được thu thêm đồ**. ⇒ *Quan hệ
xã hội bị phạt vì sự vắng mặt.* Với agent, "vắng mặt" là hành vi mặc định.

---

## 5. `道侣` — primitive thân thiện agent nhất, và ít được biết nhất

`魔域` 血誓 (99.com, **first-party**):

```
与血誓对象关系至少达到 联结伙伴·贰
两人必须组队且在同一区域附近
只有队伍的队长可以发起血誓申请
双方均未拥有其他血誓伙伴
→ 进入仪式空间，双方各选一句誓言
→ 系统据此判定：伴侣 / 兄弟 / 姐妹 / 双子 / 灵魂血誓
```

**Kiểu quan hệ được suy ra từ tổ hợp 2 lựa chọn.** Không tự do, không đàm phán,
không tranh cãi. Một người chơi có thể **thử hết 25 tổ hợp** và không tốn lượt
nào của ai. Với agent đây là hình dạng lý tưởng: **loại quan hệ là hàm của hai lựa
chọn rời rạc, không phải hàm của thương lượng**.

So với `神魔仙界` (guide farm, không dùng số): `友好度 ≥ 520`, hoa hồng
`1→+1, 9→+5, 99→+55, 999→+555` — **siêu tuyến tính**, 9% cuối của ngưỡng tốn 90%
chi phí quà. Một con số đẹp, một hệ quả xấu cho agent.

---

## 6. Giao dịch: thị trường là **cái nơi gặp nhau thật sự**

### 6.1 Toàn bộ nhánh 2024+ **bỏ `摆摊`**

`17173` (báo chí thương mại, 29/05/2026) — **một nguồn gốc, xuất hiện lặp lại
trên nhiều site**, tính một lần:

| Game | Quyết định |
|---|---|
| **诛仙世界** (2024) | **Không có `摆摊`**. Chỉ `交易行` **thuế 5%** + giao dịch trực tiếp **≤ 100万银两/ngày, ≤ 30 lần/ngày** |
| **燕云十六声** (2024) | Không `摆摊`. Chỉ `鬼市销金窟`. **Tối đa 6 món đồ treo**. **Mọi món có khoảng giá do hệ thống đặt** |
| 天下万象 | Giữ `摆摊` tự do, hỗ trợ **以物易物** |
| 剑侠情缘·零 | Giữ, **bỏ phí** giao dịch nhỏ |
| 剑侠世界4 | Giữ, **dành riêng khu `摆摊`** ở 临安码头 |

`燕云十六声` là quyết định chống tự do mạnh nhất toàn bộ tập dữ liệu: **người chơi
không thể đàm phán ra ngoài dải giá hệ thống đặt.** Đây chính là bản năng "không
có scalar" áp vào **kinh tế**, do studio khác thực hiện trước.

### 6.2 `DNF` (Tencent, first-party, 26/11/2024) — bằng chứng đầy đủ nhất về giao dịch an toàn

Không phải game tu tiên, nhưng là **tài liệu duy nhất tôi tìm được** nói thẳng
bằng ngữ pháp đo lường về việc chặn giao dịch với người lạ:

| Cơ chế | Ngưỡng |
|---|---|
| Mô hình giá | **因子定价模型**, tính `合理价` từ **7 ngày** lịch sử chốt + thuộc tính |
| Dải chấp nhận | **±30%–50%** quanh `合理价` |
| Giao dịch bất đối xứng — **mặt đấu trực tiếp** | bên giá trị cao hơn **> 30%** bên thấp hơn |
| Hạn ngạch/tháng | theo bậc `名望`; bậc cao nhất **30亿金币/tháng** |
| Reset | **1 hàng 06:00** |
| Vật phẩm giá trị cao (`辟邪玉`/`玉荣`/`领域之主`) | **phải là `冒险团好友` ≥ 14 ngày** mới giao dịch trực tiếp |
| Khóa sau khi mua | **7 ngày** không đăng/giao dịch |
| Trần một giao dịch | mail/giao dịch trực tiếp **20亿金币** |
| Trần đăng `拍卖行` | **5** món (30 nếu có phiếu) |

Dòng **14 ngày bạn bè** là câu trả lời first-party, có số, có ngày cho câu hỏi
*"làm sao chặn một agent giao dịch với người lạ"* — **bắt nó phải có quan hệ có
trước 14 ngày**. Không cần cấm, không cần kiểm duyệt.

### 6.3 Bối cảnh văn học: `坊市` là **chỗ**, `公证堂` là **ký quỹ**

Số trong tiểu thuyết (PRIMARY_TEXT), nhất quán đến mức có thể dùng làm bảng:

| Nguồn | Quy tắc |
|---|---|
| 医鸣惊仙 177 | Tòa 5 tầng, **mỗi tầng một cảnh giới**; vé 炼气 **10** / 筑基 **50** / 结丹 **100** 下品灵石; **nhảy 1 tầng = 1000**, 2 tầng = 2000, 3 tầng = 5000; tầng 5 **chưa bao giờ mở** (cả 南地 chỉ ~5 化神); phiên giao dịch **≤ 四个时辰** |
| 修仙供货商 0037 | Vào **1** 灵石, thuê chợ **+2** 灵石, **giao dịch không phí**; mở **mỗi tháng 1 và 15**; **lượng giao dịch giảm dần**, tổ chức đang cân nhắc **giảm số ngày mở** để cắt chi phí |
| 家族修仙 14 | Tường cao **10 trượng**, vé vào **1** 灵石; cấm đấu: lần 1 cảnh cáo, **lần 2 xử trảm** |
| 瑶光镇 | **200** gian hàng, **thuế 10%/giao dịch** (chợ tự do 5%); ngày 1 = 30 gian → ngày 2 = 50 → ngày 3 = 80 → **ngày 7 = 200**; thuế 20 → 500 灵石/ngày |
| 灵石兑修为 3 | `公证堂` giữ ký quỹ, **thuế 1%** giá trị, phí mở tài khoản **0.5** 灵石; lô 40 jin × 3 = 120, trừ 100 giá vốn + 1 lao động + 1.2 phí = **17.8 ròng** |

> **Đây là câu trả lời của thể loại cho câu hỏi trung tâm của đợt này, và nó không
> phải hệ thống khớp.** Thể loại trả lời: **hai người gặp nhau vì cùng đến một
> nơi, vào một ngày chợ.** Có lịch, có vé theo cảnh giới, có thuế, có cấm đấu, có
> ký quỹ. **Không có thuật toán ghép đôi nào cả.** Và **đường cong khởi động
> thanh khoản** của 瑶光镇 — 30/50/80/200 gian trong 7 ngày — chính là bảng gặp gỡ
> mà đợt này đi tìm. Nó đã được viết ra, dưới dạng tiểu thuyết, và **chưa game
> tu tiên nào ship**.

---

## 7. `论道会` — primitive thật sự, chưa ai ship, và nó trả lời câu hỏi gặp gỡ

`两界穿越` chương 31, nguyên văn. Đây là **mẹo thiết kế đắt nhất trong toàn bộ
tập dữ liệu**:

> 「此番朔风坊市散修**论道会**，可不是单纯论道辩法那么简单…**登台切磋较量**，点到即止…
> 大会期间还有不少私下的**赌斗**、隐秘**灵材交易**、**功法置换**…
> 一来同道论道…**二来更是给隐居修炼界的大佬、周边各大宗门势力看的**。
> 若是��资出众、战力强横的散修在会上崭露锋芒，**很容易被宗门大佬看中，借机招揽入门**。」

Số: sân **`数十丈`**, khán giả **近千人**, `炼气/筑基/金丹` **ngồi chung một khán
đài**, chủ tọa là 阁主 **金丹巅峰**, và **một sân duy nhất đồng thời là**:
đấu trường + sàn cược + chợ + **bàn tuyển người**.

⇒ **Cơ chế xã hội thật sự của thể loại không phải "ghép đôi", mà là "triệu tập
định kỳ dưới quyền một người có nhiệm vụ chọn".** Người thắng sự chú ý không nhận
**chỉ số**; người ta nhận **một lời mời**. Đó là quan hệ, không phải con số.

**Chưa game tu tiên nào chấp chơi.** Thể loại thay nó bằng `宗门` (tĩnh, tự nguyện
vào) và `竞技场` (thang hạng hai người). `问剑长生` đã gần tới — nhưng chọn
**tắm và cào thẻ**, không chọn sân tuyển người.

---

## 8. Scalar sức mạnh **có** xuất hiện trong ngữ cảnh xã hội

Bốn nơi, bốn cách — và hai trong số đó đúng hướng thiết kế này:

1. **`战力` làm khoá lọc** — `绝世仙王` (guide farm): tạo đội đặt được
   `队伍目标 / 等级 / 战力门槛`; danh sách đội hiện `各自等级战力`. **Việc xã hội
   được sắp xếp theo scalar.**
2. **`段位` reset về trung bình nhóm** — `捉妖修仙传`: *"当队伍成员段位不一致时，
   此队伍进入战斗后，系统会将每个成员的段位都重新调整为**队伍平均段位**，再根据
   战斗结果在平均段位基础上结算"*. Đây là nỗ lực **đã ship** để hạy PvP không
   thành so sánh scalar. ⚠️ **Nguồn yếu**: 6 URL mang **nguyên văn một bài**, đồng
   nghĩa **một nguồn**, không phải sáu. Nhãn `GUIDE_FARM`, dùng như **giả thuyết có
   số**, không dùng như sự thật.
3. **Khớp theo cảnh giới, không theo `战力`** — `灵兽大冒险`: *"系统会智能推荐和你
   **等级接近**的灵兽师，避免等级差距过大组队尴尬"*.
4. **Lợi ích `宗门` là mật độ khí, không phải nhân sát thương** — `一念逍遥`:
   `11级宗门 → 灵气 +22` (3DM). *Lăng tròng tích tụ quanh một cảnh giới môi trường.*

### 8.1 Bằng chứng mạnh nhất, từ chính diễn đàn của nhà phát triển

`诛仙` (bbs.wanmei.com, 16/08/2026), phân tích `跨服赛`:

> 「不少**老牌强队接连爆冷出局**…队内主力断层严重…本届很多帮**不找打手**了」
> 「号被号贩子接手后**拆装备然后继续低价甩卖**」
> 「**反观不少小帮**，虽然名气不大，装备也是昭武套…但是胜在**人员稳定，职业配置合理**，
> 才有了这几场**意料之外的爆冷**」

> 「**帮派来来去去就那么几个人出声了**，打个帮派boss就剩那么几个人打了」
> 「这游戏19年以来人一直是越来越少，**从来没反弹过**」

Đây là kết luận thiết kế đúng, do người chơi rút ra trên diễn đàn chính thức:
**ổn định đội hình và cấu trúc vai trò đánh bại phân cấp trang bị.** Không ai
trong thể loại **đo** điều này. Đó là phép đo rẻ nhất chưa ai chạy.

---

## 9. Những game làm **KHÁC**

Xếp theo giá trị thiết kế, giảm dần.

| # | Game | Nó làm gì khác | Vì sao quan trọng cho ta |
|---|---|---|---|
| 1 | **觅长生** | **Không có social người-chơi nào cả.** Thay bằng thang `声望` 7 bậc + `好感度` + quà tặng + phép `神识` có thể **thất bại**. Ngoài game: 50 nhóm QQ | Ván bài tham chiếu của đợt trước **từ bỏ** đúng cái thứ ta đang cố xây. Chứng minh 2 lựa chọn là 1 |
| 2 | **DNF** (Tencent) | Dải giá ±30–50%, hạn ngạch theo `名望`, **bắt 14 ngày bạn bè**, khóa 7 ngày, trần 20亿 | Câu trả lời first-party duy nhất: **chặn giao dịch người lạ bằng quan hệ có trước, không bằng kiểm duyệt** |
| 3 | **燕云十六声** | Chợ có **dải giá hệ thống đặt**, trần **6 món**. Không thương lượng | Chống tự do trong **kinh tế** — bản năng "không scalar" đã được studio khác thực hiện |
| 4 | **`论道会`** (văn học) | Sân đấu + cược + chợ + **bàn tuyển người**, chủ tọa có nhiệm vụ chọn | **Chưa ai ship.** Cơ chế gặp gỡ thật sự của thể loại |
| 5 | **魔域 血誓** | Loại quan hệ **suy từ tổ hợp 2 lựa chọn** (5 loại huyết thệ) | Hình dạng quan hệ lý tưởng cho agent: rời rạc, không đàm phán, thử được |
| 6 | **`问剑长生`** | Đổi tên thành `轻遇`, thêm **tắm** và **cào thẻ**; bể social **16** server vs bể thi đấu **8** | Studio lớn nhất thể loại **đã thử và thất bại** rồi lùi về độ thao tác bằng 0 |
| 7 | **捉妖修仙传** | `段位` của cả đội **reset về trung bình** trước trận | Nỗ lực ship để PvP không thành so sánh scalar. Nguồn yếu, nhưng hình dạng đáng nghiên cứu |
| 8 | **诛仙世界** | Bỏ `摆摊`; giao dịch trực tiếp trần **30 lần/ngày, 100万/ngày** | Trần **theo lượt/ngày** thay vì cấm — vẫn cho phép, nhưng giới hạn tần suất |
| 9 | **聚仙** `师徒` | Trần **1000** đệ tử xuất sư; chênh cấp ≥10; phạt nếu đệ tử **không上线 7 ngày** | Xử lý "vắng mặt" như một **vi phạm có hậu quả** |
| 10 | **`灵兽` 招募** | **3** nhãn, **20 ký tự**, **7 ngày**, gợi ý theo cảnh giới | Khuôn mẫu `招募` tốt nhất, giới hạn cứng vào **thứ tự chữ** |
| 11 | **`一念逍遥`** | Cổng xã hội = **2 cửa sổ 10 phút mỗi tuần** | Hình dạng nguy hiểm nhất; biết nó để **không** lặp lại |

---

## 10. Rủi ro agent — bảng

| Rủi ro | Bằng chứng cụ thể | Nguồn |
|---|---|---|
| **REQUIRES_REFLEX** | `圣魔之血` cưới: **hai cửa sổ 30 giây**, cả hai phải thi hành cử chỉ đồng thời | **first-party** |
| **REQUIRES_REFLEX** | `圣魔印` lễ cưới: nữ bị đóng băng, nam phải hạ quái **không để cô chết** | guide |
| **REQUIRES_COORDINATION** | `成吉思汗2`: **≤ 10 mét**, đội đúng 2; `师徒` 出师: **đội + thầy làm đội trưởng + tại NPC** | first-party |
| **REQUIRES_COORDINATION** | Mọi quan hệ bền vững kết thúc bằng **đồng thời** — đây là **khuôn mẫu**, không phải tai nạn | tổng hợp 5 game |
| **REQUIRES_WALL_CLOCK** | `一念逍遥` `宗门道场` **21:00–21:10 T2/T4**; `镇魔深渊` **09:00–09:10 T3/T5** — 10 phút | first-party |
| **REQUIRES_WALL_CLOCK** | `梦幻新诛仙` 传功 **1/ngày, 3/tuần**; `梦幻西游` thu đệ tử **1/tuần** | first-party |
| **REQUIRES_FREE_TEXT** | `组队喊话` là **kênh gặp người chính**; người chơi phải viết `"1T3DPS1奶"` trong bộ lọc đối kháng | first-party (sự việc 2024) |
| **REQUIRES_FREE_TEXT** | `灵兽` 宣言 **20 ký tự** tự do | first-party |
| **REQUIRES_POWER_SCALAR** | `战力` là khoá lọc danh sách đội; `段位` arena; `名望` chia hạn ngạch thương mại | first-party + guide |
| **REQUIRES_POWER_SCALAR** | `灵根` là xổ số lúc sinh — `"天灵根优先留主角位，杂灵根弟子种田当苦力"` | TapTap (sơ cấp) |
| **REQUIRES_GRIND** | `神魔仙界` hoa hồng siêu tuyến: `999→+555` cho ngưỡng `520` | guide farm |
| **REQUIRES_GRIND** | `圣魔之血` 10+10+10 thẻ + 1314 vàng, lặp lại được | first-party |
| **REQUIRES_LONG_HORIZON** | 出师 100% từ **4 chương trình** (日常/周常/历程/周考) | first-party |
| **SILENT_FAILURE** | `组队喊话` bị chặn, người chơi **không biết tại sao**, không tìm được đội trong 48h | **first-party, có ngày** |
| **SILENT_FAILURE** | `宗门` còn nhận được nhưng `"来来去去就那么几个人出声了"` — **chết xã hội không tín hiệu** | diễn đàn chính thức |
| **REQUIRES_MICROMANAGEMENT** | `一念逍遥` chuỗi hằng ngày: 建设 / 喂养神兽 / 宗门事务, "每日首次免费" | first-party |
| **REQUIRES_FREE_TEXT** | `逆神` 6/2026 phải **tắt toàn bộ** chat + `组队招募` + `公会公告` + `昵称` + `签名` vì kiểm duyệt | first-party |

---

## 11. Chỗ trống thiết kế

| Khe | Vì sao còn mở | Ràng buộc phải tuân thủ |
|---|---|---|
| **`论道会` định kỳ theo LƯỢT** | Văn học có, game chưa game nào chấp chơi. Thể loại thay bằng `宗门` tĩnh và `竞技a` hai người | Phải **không** trở thành bảng xếp hạng. Phần thưởng là **lời mời**, không phải chỉ số |
| **Chợ ký quỹ cho agent** | `燕云` giết thương lượng bằng dải giá; `DNF` giết bằng 14 ngày. **Chưa ai dùng ký quỹ** — `公证堂` 1% là bản vẽ trong tiểu thuyết | Không tự do, không cần quan hệ có trước, không cần tin tưởng |
| **Gặp gỡ theo LƯỢT thay vì đồng hồ** | Mọi lối thoát hiện tại đều là đồng hồ thật hoặc cửa sổ 10 phút | Cửa sổ phải đo được **bằng lượt**, không bằng giây |
| **Đội hợp lệ theo VAI TRÒ, không theo sức mạnh** | Chính người chơi `诛仙` kết luận như vậy; chưa ai đo; chưa ai ship | Không đọc chỉ số tấn công của đồng đội |
| **`觅长生` × agent-to-agent** | Ván bài tham chiếu của đợt trước **đã loại bỏ** nó | Cặp (permission) × (gặp gỡ) **chưa từng cùng ship** |
| **Bảng gặp gỡ có số** | 瑶光镇 30/50/80/200 gian trong 7 ngày **là** đường cong thanh khoản, viết bằng tiểu thuyết | Cần lịch + vé + thuế + cấm đấu, **không** cần thuật toán ghép |

---

## 12. Chưa đo được (nói thẳng)

- **Không studio nào công bố** tỉ lệ ghép thành công, thời gian chờ trung bình, hay
  tỉ lệ rơi của `宗门`. Ba con số của `问剑长生` là **tổng tích luỹ**, không phải
  phễu.
- **Không ai đo** `战力` có dự đoán thắng PvP hay không. `诛仙` cho thấy **đội hình**
  thắng **trang bị**, nhưng đó là phân tích diễn đàn, không phải dữ liệu.
- **Không có bản ghi nào** về cửa sổ 30 giây của `圣魔之血` — nó chỉ tồn tại trên
  trang chính thức năm 2019, không có log người chơi nào được trích.
- **Tỉ lệ người chơi `问剑长生` hình thành `道缘` là 6%** — nhưng mẫu số là **tài
  khoản đăng ký**, không phải người chơi hoạt động. Mẫu số thật nhỏ hơn nhiều và
  không ai công bố.
- Chưa tìm được **bất kỳ** nguồn first-party nào về hệ thống `聊���`/kênh thế giới
  của bất kỳ game tu tiên nào — tức là **cơ chế gặp gỡ chính của thể loại gần như
  không có tài liệu kỹ thuật nào cả.** Đó là một phát hiện, không phải lỗ hổng.

---

## 13. Tỉ lệ bằng chứng

**Khoảng 55–60% theo mục**, nhưng **~80% theo con số có tải trọng** — và **100%
theo các con số ràng buộc thiết kế** (trần, phí, cửa sổ, cổng, độ mờ bể khớp).
Toàn bộ vật liệu guide-farm thu được gần như **hoàn toàn là văn mô tả sản phẩm**;
hai chỗ nó sinh ra số — bảng trần `一念逍遥` (tự thừa nhận không tin, và bị phủ định)
và `捉妖修仙传` (một bài, sáu bản sao) — đều được gắn nhãn và **không mang tải
trọng**. `乐爱Claw` (`肥猫修仙`, `烽火对决`, +12% 神识, 1.7倍, 89% — văn phong đo
lường hoàn hảo, không nguồn) **đã bị loại hoàn toàn**. Cùng loại: `m.tielingcn.com`
("Sensor Tower 5000万下载" cho một game không tồn tại), `game.zixia.com`,
`biwuzhaoqin.com`, `98uc.cn`.
