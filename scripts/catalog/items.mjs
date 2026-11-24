/**
 * Перечень каталога мебели (SPEC §12, D-07, D-25): единственный источник правды для конвейера
 * `scripts/catalog/*.mjs`. Здесь — отбор предметов и решения по карточкам (название, категория,
 * помещения, способ установки); габариты, коллайдеры и вес берутся из подготовленных моделей.
 *
 * rooms: living = гостиная, bedroom = спальня, kitchen = кухня, bath = ванная, toilet = туалет,
 * hall = прихожая; раскрываются в типы помещений модели (kitchenLiving, combinedBathroom).
 */

export const ROOM_GROUPS = {
  living: ['living', 'kitchenLiving'],
  bedroom: ['bedroom'],
  kitchen: ['kitchen', 'kitchenLiving'],
  bath: ['bathroom', 'combinedBathroom'],
  toilet: ['toilet', 'combinedBathroom'],
  hall: ['hallway'],
}

/**
 * Kenney Furniture Kit (CC0, https://kenney.nl/assets/furniture-kit): простые модели без текстур.
 * Они стилизованы и заметно мельче реальных (стул 20 × 47 × 20 см), поэтому масштаб задан явно, в см:
 * одно значение — равномерный масштаб по этой оси (w = ширина, d = глубина, h = высота);
 * все три — осевой масштаб для «коробочных» предметов (кухонные модули, холодильник, шкаф).
 * Формат: [файл в наборе, название, категория, помещения, масштаб в см].
 */
export const KENNEY = [
  ['bathtub', 'Ванна', 'Сантехника', ['bath'], { w: 170 }],
  ['bathroomSink', 'Раковина', 'Сантехника', ['bath', 'toilet'], { h: 85 }],
  ['toilet', 'Унитаз', 'Сантехника', ['toilet', 'bath'], { d: 70 }],
  ['shower', 'Душевая кабина', 'Сантехника', ['bath'], { h: 200 }],
  ['washer', 'Стиральная машина', 'Бытовая техника', ['bath', 'kitchen'], { w: 60, d: 60, h: 85 }],
  ['trashcan', 'Мусорное ведро', 'Декор', ['bath', 'toilet', 'kitchen'], { h: 45 }],
  ['bedDouble', 'Кровать двуспальная', 'Кровати', ['bedroom'], { d: 200 }],
  ['bedSingle', 'Кровать односпальная', 'Кровати', ['bedroom'], { d: 200 }],
  ['cabinetBed', 'Прикроватная тумба', 'Хранение', ['bedroom'], { h: 50 }],
  ['bookcaseClosedDoors', 'Шкаф платяной', 'Хранение', ['bedroom', 'hall'], { h: 200 }],
  ['kitchenFridge', 'Холодильник', 'Бытовая техника', ['kitchen'], { w: 60, d: 65, h: 170 }],
  ['kitchenStove', 'Плита', 'Бытовая техника', ['kitchen'], { w: 60, d: 60, h: 90 }],
  ['kitchenSink', 'Кухонная мойка', 'Кухонные модули', ['kitchen'], { w: 60, d: 60, h: 90 }],
  ['kitchenCabinet', 'Кухонный модуль', 'Кухонные модули', ['kitchen'], { w: 60, d: 60, h: 90 }],
  ['coatRackStanding', 'Вешалка напольная', 'Хранение', ['hall', 'bedroom'], { h: 170 }],
  ['lampRoundFloor', 'Торшер', 'Освещение', ['living', 'bedroom', 'hall'], { h: 160 }],
  ['cabinetTelevision', 'ТВ-тумба', 'Хранение', ['living'], { w: 140 }],
  ['dryer', 'Сушильная машина', 'Бытовая техника', ['bath', 'kitchen'], { w: 60, d: 60, h: 85 }],
  ['washerDryerStacked', 'Стиральная и сушильная машины (колонна)', 'Бытовая техника', ['bath'], { w: 60, d: 60, h: 185 }],
  // Электроника. mount: 'surface' — настольный предмет: ставится на стол, тумбу или кухонный модуль
  // (правила — src/domain/placement.ts, hasSupportSurface); без mount предмет стоит на полу.
  ['speaker', 'Колонка напольная', 'Электроника', ['living'], { h: 100 }],
  // Освещение (этап 21; свет — src/catalog/lights.ts). Бра ставится на стену на высоте 160 см, плафон висит на потолке.
  ['lampSquareFloor', 'Торшер квадратный', 'Освещение', ['living', 'bedroom', 'hall'], { h: 150 }],
  ['lampRoundTable', 'Настольная лампа круглая', 'Освещение', ['living', 'bedroom'], { h: 42, mount: 'surface' }],
  ['lampSquareTable', 'Настольная лампа квадратная', 'Освещение', ['living', 'bedroom'], { h: 38, mount: 'surface' }],
  ['lampWall', 'Бра настенное', 'Освещение', ['living', 'bedroom', 'hall'], { w: 24, mount: 'wall' }],
  ['lampSquareCeiling', 'Плафон потолочный', 'Люстры', ['living', 'bedroom', 'kitchen', 'hall'], { w: 30, mount: 'ceiling' }],
  ['televisionModern', 'Телевизор современный', 'Электроника', ['living', 'bedroom'], { w: 100, mount: 'surface' }],
  ['televisionVintage', 'Телевизор ламповый', 'Электроника', ['living', 'bedroom'], { w: 50, mount: 'surface' }],
  ['laptop', 'Ноутбук', 'Электроника', ['living', 'bedroom', 'kitchen'], { w: 34, mount: 'surface' }],
  ['computerScreen', 'Монитор', 'Электроника', ['living', 'bedroom'], { w: 55, mount: 'surface' }],
  ['radio', 'Радиоприёмник', 'Электроника', ['living', 'bedroom', 'kitchen'], { w: 30, mount: 'surface' }],
  ['toaster', 'Тостер', 'Бытовая техника', ['kitchen'], { w: 28, mount: 'surface' }],
  ['kitchenMicrowave', 'Микроволновая печь', 'Бытовая техника', ['kitchen'], { w: 45, mount: 'surface' }],
]

/**
 * Собственные модели проекта (этап 21): строятся кодом scripts/catalog/make-lights.mjs, ничего не скачивается.
 * Масштаб не меняется (модели сразу в реальных размерах, метры). Формат: [id, название, категория, помещения, mount].
 */
export const OWN = [
  ['own_chandelier_classic', 'Люстра классическая', 'Люстры', ['living', 'bedroom', 'hall'], 'ceiling'],
  ['own_chandelier_round', 'Люстра круглая современная', 'Люстры', ['living', 'bedroom', 'kitchen', 'hall'], 'ceiling'],
  // Настенные предметы (D-30): высота подвеса по умолчанию — src/catalog/lights.ts, меняется в панели «Предметы».
  ['own_tv_wall', 'Телевизор на стену', 'Электроника', ['living', 'bedroom', 'kitchen'], 'wall'],
  ['own_picture', 'Картина', 'Декор', ['living', 'bedroom', 'kitchen', 'hall'], 'wall'],
  ['own_mirror', 'Зеркало настенное', 'Декор', ['living', 'bedroom', 'hall', 'bath', 'toilet'], 'wall'],
  ['own_shelf_wall', 'Полка настенная', 'Хранение', ['living', 'bedroom', 'kitchen', 'hall', 'bath'], 'wall'],
  ['own_clock_wall', 'Часы настенные', 'Декор', ['living', 'bedroom', 'kitchen', 'hall'], 'wall'],
]

/** Poly Haven (CC0): PBR-сканы, 1k-текстуры. */
export const POLYHAVEN = [
  ['sofa_02', 'Диван', 'Мягкая мебель', ['living']],
  ['Sofa_01', 'Малый диван', 'Мягкая мебель', ['living']],
  ['ArmChair_01', 'Кресло', 'Мягкая мебель', ['living', 'bedroom']],
  ['Ottoman_01', 'Пуф', 'Мягкая мебель', ['living', 'bedroom', 'hall']],
  ['modern_coffee_table_01', 'Журнальный столик', 'Столы', ['living']],
  ['side_table_01', 'Приставной столик', 'Столы', ['living', 'bedroom']],
  ['modern_wooden_cabinet', 'Тумба', 'Хранение', ['living', 'hall']],
  ['Shelf_01', 'Стеллаж', 'Хранение', ['living', 'bedroom', 'hall']],
  ['painted_wooden_nightstand', 'Тумбочка', 'Хранение', ['bedroom']],
  ['ClassicNightstand_01', 'Тумбочка классическая', 'Хранение', ['bedroom']],
  ['vintage_cabinet_01', 'Шкаф', 'Хранение', ['bedroom', 'hall']],
  ['drawer_cabinet', 'Комод высокий', 'Хранение', ['bedroom', 'hall']],
  ['GothicCommode_01', 'Комод', 'Хранение', ['bedroom', 'living']],
  ['dining_chair_02', 'Стул', 'Стулья', ['kitchen', 'living']],
  ['painted_wooden_chair_01', 'Стул деревянный', 'Стулья', ['kitchen']],
  ['bar_chair_round_01', 'Барный стул', 'Стулья', ['kitchen']],
  ['wooden_table_02', 'Стол обеденный', 'Столы', ['kitchen']],
  ['round_wooden_table_02', 'Стол круглый', 'Столы', ['kitchen']],
  ['wooden_stool_01', 'Табурет', 'Стулья', ['kitchen', 'bath', 'toilet', 'hall']],
  ['folding_wooden_stool', 'Складной табурет', 'Стулья', ['kitchen', 'bath', 'toilet']],
  ['ClassicConsole_01', 'Консоль', 'Хранение', ['hall', 'living']],
  ['painted_wooden_bench', 'Скамья', 'Стулья', ['hall', 'bedroom']],
  ['painted_wooden_shelves', 'Этажерка', 'Хранение', ['hall', 'bath']],
  ['painted_wooden_cabinet', 'Шкафчик', 'Хранение', ['hall', 'kitchen', 'bath']],
  ['wicker_basket_01', 'Корзина', 'Декор', ['bath', 'toilet', 'bedroom']],
  ['potted_plant_04', 'Растение', 'Декор', ['living', 'bedroom', 'kitchen', 'bath', 'toilet', 'hall']],
]

/**
 * FurniMesh (https://furnimesh.com/library/): модели сгенерированы нейросетью по фото пользователей.
 * Лицензия — заявление сайта «free, commercial use, no attribution» (не CC0, автор не указан), скачано
 * с согласия пользователя 2026-11-16. Масштаб в файлах произвольный («scene units»), поэтому реальный
 * размер задан явно, равномерным масштабом по одной оси (w — ширина, d — глубина, h — высота), как у Kenney.
 * Геометрия упрощается (около 290 тыс. треугольников в исходнике).
 * Формат: [id, название, категория, помещения, масштаб в см, страница модели].
 * Бра fm_wall_lamp_travertine скачано, но в каталог не входит: редактор ставит предметы на высоту 0,
 * настенный монтаж с высотой — этап 21. Настольная лампа fm_table_lamp_velvet (tndfyy) скачана, но отклонена:
 * дыры и пятна на абажуре в исходнике, упрощение не опускается ниже 73 тыс. треугольников (4,5 МБ).
 * Стол fm_desk_black (t0qj4p) отклонён: при высоте 76 см это угловой стол 290 × 140 см, для квартиры не подходит.
 * Тумба с раковиной fm_vanity_walnut (art2gd) отклонена: брак генерации (бесформенные куски внутри, нет фасада).
 * Декор с сайта (2026-11-22): отклонены ваза с пампасной травой fm_vase_black (x8rzbf: 167 тыс. треугольников не упрощаются,
 * файл 4,0 МБ при лимите 3 МБ), настольные часы (bxhdqg) и оливковое дерево в горшке (kdkvhn): текстура 4096 px с шумом,
 * после сжатия PSNR 20–22 дБ при пороге 35. Брак генерации по превью: ваза yjjzbb (плоская плита), зеркало pgg4a1 (розовые
 * кляксы поверх стекла), скульптура e2g3fl (бесформенный набор деталей).
 * rot — поворот вокруг вертикали (градусы), чтобы перед смотрел на +Z; err — допуск упрощения (доля размера).
 */
export const FURNIMESH = [
  ['fm_floor_lamp_arc', 'Торшер дуговой', 'Освещение', ['living', 'bedroom'], { h: 180 }, 'lighting/floor-lamp/a-modern-arc-floor-lamp-featuring-a-4cdk85'],
  ['fm_floor_lamp_pleated', 'Торшер с абажуром', 'Освещение', ['living', 'bedroom', 'hall'], { h: 160 }, 'lighting/floor-lamp/a-tall-floor-lamp-featuring-a-tapered-v2gqrf'],
  ['fm_table_lamp_wood', 'Настольная лампа деревянная', 'Освещение', ['living', 'bedroom'], { h: 50, mount: 'surface' }, 'lighting/table-lamp/a-modern-table-lamp-featuring-a-solid-xm42tw'],
  ['fm_desk_oak', 'Письменный стол дубовый', 'Столы', ['living', 'bedroom'], { w: 120 }, 'tables/desk/a-contemporary-desk-crafted-from-light-oak-ynjo42'],
  ['fm_tv_stand_light', 'ТВ-тумба светлая', 'Хранение', ['living', 'bedroom'], { w: 150 }, 'storage/tv-stand/a-light-wood-midcentury-modern-style-tv-4zqouh'],
  ['fm_tv_stand_walnut', 'ТВ-тумба ореховая', 'Хранение', ['living'], { w: 180 }, 'storage/tv-stand/a-long-low-wooden-media-console-featuring-5j7t4f'],
  ['fm_tv_wall', 'ТВ-стенка подвесная', 'Хранение', ['living'], { w: 200, mount: 'wall' }, 'storage/tv-stand/a-modern-floating-wallmounted-entertainment-unit-featuring-d53vp5'],
  ['fm_planter_fluted', 'Кашпо рифлёное', 'Декор', ['living', 'bedroom', 'hall'], { w: 45 }, 'decor/planter/a-large-offwhite-planter-with-a-textured-qc84ld'],
  ['fm_plant_peperomia', 'Пеперомия в керамическом горшке', 'Декор', ['living', 'bedroom', 'kitchen', 'bath'], { h: 35, err: 1, mount: 'surface' }, 'decor/plant/a-small-potted-plant-likely-a-peperomia-ezhiyc'],
  ['fm_basket_seagrass', 'Корзина плетёная', 'Декор', ['living', 'bedroom', 'bath', 'hall'], { w: 40, err: 1 }, 'decor/basket/a-rectangular-woven-basket-with-two-loop-ek94ik'],
  ['fm_bed_tufted', 'Кровать мягкая', 'Кровати', ['bedroom'], { d: 215 }, 'beds/bed/a-modern-upholstered-platform-bed-featuring-a-84flyv'],
  ['fm_bed_lowprofile', 'Кровать низкая', 'Кровати', ['bedroom'], { d: 210 }, 'beds/bed/a-lowprofile-contemporary-platform-bed-featuring-a-k8zcy9'],
  ['fm_wardrobe_wood', 'Шкаф платяной деревянный', 'Хранение', ['bedroom', 'hall'], { h: 200 }, 'storage/wardrobe/a-tall-rectangular-freestanding-wardrobe-cabinet-featuring-nzutif'],
]
