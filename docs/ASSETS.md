# Реестр ассетов

Каталог содержит только бесплатные модели (FR-17). Для каждой модели фиксируются источник, автор, лицензия, условия указания авторства и дата получения (SPEC §12).

## Технический набор этапа 4

Не утверждённый ассортимент (SPEC D-07): модели нужны для проверки импорта, габаритов, переноса и качества картинки. Файлы лежат в `public/models/<id>/` (glTF + .bin + текстуры 1k), общий вес 5,5 МБ.

| Модель | Источник | Автор | Лицензия | Авторство | Получено | Габариты по модели, см (Ш×Г×В) |
|---|---|---|---|---|---|---|
| sofa_02 | https://polyhaven.com/a/sofa_02 | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 180,7 × 81,8 × 70,9 |
| modern_coffee_table_01 | https://polyhaven.com/a/modern_coffee_table_01 | Amin | CC0 1.0 | не требуется | 2026-11-15 | 60,0 × 120,2 × 39,0 |
| dining_chair_02 | https://polyhaven.com/a/dining_chair_02 | James Ray Cock | CC0 1.0 | не требуется | 2026-11-15 | 43,4 × 57,6 × 97,3 |
| modern_wooden_cabinet | https://polyhaven.com/a/modern_wooden_cabinet | Patrik Pangerl | CC0 1.0 | не требуется | 2026-11-15 | 244,0 × 52,0 × 68,0 |

Лицензия Poly Haven: https://polyhaven.com/license (CC0, коммерческое использование и распространение в веб-приложении допустимы).
Габариты измерены в браузере по `Box3` загруженной модели (e2e `4.3`), подтверждены тестом с допуском 1,5 см.

Особенности моделей (учитывает нормализация на этапе 13):
- Начало координат моделей не в центре основания (у дивана смещение по z, у шкафа створки заданы дочерними узлами). Редактор нормализует точку опоры по `Box3`: начало — центр основания.
- Ось «вперёд» — +Z (glTF), перед предмета совпадает с передней стороной на плане.

## Рабочий каталог мебели (этап 13, D-25)

<!-- catalog:start -->
| Модель | Название | Категория | Источник | Авторы | Лицензия | Авторство | Получено | Габариты, см (Ш × Г × В) | Вес, КБ до → после | PSNR, дБ |
|---|---|---|---|---|---|---|---|---|---|---|
| sofa_02 | Диван | Мягкая мебель | https://polyhaven.com/a/sofa_02 | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 180,7 × 81,8 × 70,9 | 417 → 213 | 43,2 |
| Sofa_01 | Малый диван | Мягкая мебель | https://polyhaven.com/a/Sofa_01 | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 157,1 × 65,8 × 79,7 | 506 → 259 | 42 |
| ArmChair_01 | Кресло | Мягкая мебель | https://polyhaven.com/a/ArmChair_01 | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 84,8 × 76,6 × 106,5 | 751 → 523 | 40,8 |
| Ottoman_01 | Пуф | Мягкая мебель | https://polyhaven.com/a/Ottoman_01 | Caspian Fortune | CC0 1.0 | не требуется | 2026-11-15 | 88,5 × 62,1 × 62,4 | 637 → 412 | 41,3 |
| modern_coffee_table_01 | Журнальный столик | Столы | https://polyhaven.com/a/modern_coffee_table_01 | Amin | CC0 1.0 | не требуется | 2026-11-15 | 60 × 120,2 × 39 | 1300 → 236 | 41,1 |
| side_table_01 | Приставной столик | Столы | https://polyhaven.com/a/side_table_01 | James Ray Cock | CC0 1.0 | не требуется | 2026-11-15 | 55 × 45 × 55,1 | 493 → 233 | 99 |
| modern_wooden_cabinet | Тумба | Хранение | https://polyhaven.com/a/modern_wooden_cabinet | Patrik Pangerl | CC0 1.0 | не требуется | 2026-11-15 | 244 × 52 × 68 | 2789 → 576 | 38,7 |
| Shelf_01 | Стеллаж | Хранение | https://polyhaven.com/a/Shelf_01 | Gabriel Radić | CC0 1.0 | не требуется | 2026-11-15 | 100,3 × 25,7 × 208 | 591 → 414 | 41,5 |
| painted_wooden_nightstand | Тумбочка | Хранение | https://polyhaven.com/a/painted_wooden_nightstand | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 50,5 × 50,9 × 61,6 | 2101 → 386 | 39,5 |
| ClassicNightstand_01 | Тумбочка классическая | Хранение | https://polyhaven.com/a/ClassicNightstand_01 | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 56,8 × 42,4 × 70 | 435 → 207 | 42,6 |
| vintage_cabinet_01 | Шкаф | Хранение | https://polyhaven.com/a/vintage_cabinet_01 | Rico Cilliers | CC0 1.0 | не требуется | 2026-11-15 | 202,2 × 67 × 223,5 | 2804 → 987 | 41,5 |
| drawer_cabinet | Комод высокий | Хранение | https://polyhaven.com/a/drawer_cabinet | Ulan Cabanilla | CC0 1.0 | не требуется | 2026-11-15 | 114,1 × 48,8 × 188,1 | 1117 → 415 | 41,2 |
| GothicCommode_01 | Комод | Хранение | https://polyhaven.com/a/GothicCommode_01 | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 120,1 × 58,1 × 121,2 | 590 → 279 | 40,9 |
| dining_chair_02 | Стул | Стулья | https://polyhaven.com/a/dining_chair_02 | James Ray Cock | CC0 1.0 | не требуется | 2026-11-15 | 43,4 × 57,6 × 97,3 | 899 → 373 | 43,6 |
| painted_wooden_chair_01 | Стул деревянный | Стулья | https://polyhaven.com/a/painted_wooden_chair_01 | Kuutti Siitonen | CC0 1.0 | не требуется | 2026-11-15 | 43,2 × 54 × 95,6 | 481 → 246 | 40,9 |
| bar_chair_round_01 | Барный стул | Стулья | https://polyhaven.com/a/bar_chair_round_01 | Dairon Sanchez | CC0 1.0 | не требуется | 2026-11-15 | 48,3 × 48,6 × 75,1 | 2746 → 717 | 39,3 |
| wooden_table_02 | Стол обеденный | Столы | https://polyhaven.com/a/wooden_table_02 | Serhii Khromov | CC0 1.0 | не требуется | 2026-11-15 | 113,4 × 70,6 × 80 | 474 → 273 | 40,2 |
| round_wooden_table_02 | Стол круглый | Столы | https://polyhaven.com/a/round_wooden_table_02 | Ulan Cabanilla | CC0 1.0 | не требуется | 2026-11-15 | 79,6 × 79,6 × 74,6 | 1876 → 303 | 40,9 |
| wooden_stool_01 | Табурет | Стулья | https://polyhaven.com/a/wooden_stool_01 | Kuutti Siitonen | CC0 1.0 | не требуется | 2026-11-15 | 42,5 × 44,2 × 43,7 | 939 → 642 | 39,5 |
| folding_wooden_stool | Складной табурет | Стулья | https://polyhaven.com/a/folding_wooden_stool | Ulan Cabanilla | CC0 1.0 | не требуется | 2026-11-15 | 52,8 × 54,7 × 44,2 | 2215 → 476 | 39,2 |
| ClassicConsole_01 | Консоль | Хранение | https://polyhaven.com/a/ClassicConsole_01 | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 154,3 × 58,9 × 94,9 | 723 → 429 | 41,6 |
| painted_wooden_bench | Скамья | Стулья | https://polyhaven.com/a/painted_wooden_bench | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 116,5 × 49,7 × 88,9 | 1943 → 345 | 40 |
| painted_wooden_shelves | Этажерка | Хранение | https://polyhaven.com/a/painted_wooden_shelves | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 51,1 × 36,7 × 112,5 | 2061 → 387 | 40,2 |
| painted_wooden_cabinet | Шкафчик | Хранение | https://polyhaven.com/a/painted_wooden_cabinet | Kirill Sannikov | CC0 1.0 | не требуется | 2026-11-15 | 119,5 × 61,7 × 118,2 | 1818 → 305 | 39,1 |
| wicker_basket_01 | Корзина | Декор | https://polyhaven.com/a/wicker_basket_01 | Kuutti Siitonen | CC0 1.0 | не требуется | 2026-11-15 | 38,3 × 29,5 × 11,7 | 2666 → 622 | 38,9 |
| potted_plant_04 | Растение | Декор | https://polyhaven.com/a/potted_plant_04 | James Ray Cock | CC0 1.0 | не требуется | 2026-11-15 | 16,8 × 18,5 × 26,7 | 2073 → 498 | 39,4 |
| kenney_bathtub | Ванна | Сантехника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 170 × 80 × 60 | 35 → 11 | нет текстур |
| kenney_bathroomSink | Раковина | Сантехника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 51,6 × 44 × 85 | 22 → 8 | нет текстур |
| kenney_toilet | Унитаз | Сантехника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 45,8 × 70 × 66,2 | 18 → 9 | нет текстур |
| kenney_shower | Душевая кабина | Сантехника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 102,7 × 106,4 × 200 | 51 → 15 | нет текстур |
| kenney_washer | Стиральная машина | Бытовая техника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 60 × 60 × 85 | 47 → 17 | нет текстур |
| kenney_trashcan | Мусорное ведро | Декор | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 21,8 × 24,6 × 45 | 6 → 4 | нет текстур |
| kenney_bedDouble | Кровать двуспальная | Кровати | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 170 × 200 × 66,7 | 23 → 10 | нет текстур |
| kenney_bedSingle | Кровать односпальная | Кровати | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 101,5 × 200 × 66,7 | 18 → 10 | нет текстур |
| kenney_cabinetBed | Прикроватная тумба | Хранение | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 57 × 46,1 × 50 | 7 → 5 | нет текстур |
| kenney_bookcaseClosedDoors | Шкаф платяной | Хранение | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 94,1 × 58,8 × 200 | 22 → 9 | нет текстур |
| kenney_kitchenFridge | Холодильник | Бытовая техника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 60 × 65 × 170 | 20 → 11 | нет текстур |
| kenney_kitchenStove | Плита | Бытовая техника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 60 × 60 × 90 | 53 → 16 | нет текстур |
| kenney_kitchenSink | Кухонная мойка | Кухонные модули | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 60 × 60 × 90 | 23 → 13 | нет текстур |
| kenney_kitchenCabinet | Кухонный модуль | Кухонные модули | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 60 × 60 × 90 | 10 → 7 | нет текстур |
| kenney_coatRackStanding | Вешалка напольная | Хранение | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 60,2 × 60,2 × 170 | 13 → 4 | нет текстур |
| kenney_lampRoundFloor | Торшер | Освещение | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 28,3 × 32,7 × 160 | 6 → 4 | нет текстур |
| kenney_cabinetTelevision | ТВ-тумба | Хранение | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 140 × 43,7 × 54,2 | 10 → 3 | нет текстур |
| fm_floor_lamp_arc | Торшер дуговой | Освещение | https://furnimesh.com/library/lighting/floor-lamp/a-modern-arc-floor-lamp-featuring-a-4cdk85/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 46,7 × 148,2 × 180 | 17466 → 527 | 38,9 |
| fm_table_lamp_wood | Настольная лампа деревянная | Освещение | https://furnimesh.com/library/lighting/table-lamp/a-modern-table-lamp-featuring-a-solid-xm42tw/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 40,4 × 40,4 × 50 | 12735 → 425 | 40,6 |
| fm_desk_oak | Письменный стол дубовый | Столы | https://furnimesh.com/library/tables/desk/a-contemporary-desk-crafted-from-light-oak-ynjo42/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 120 × 57 × 78,8 | 10710 → 291 | 45,8 |
| fm_floor_lamp_pleated | Торшер с абажуром | Освещение | https://furnimesh.com/library/lighting/floor-lamp/a-tall-floor-lamp-featuring-a-tapered-v2gqrf/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 40,7 × 40,8 × 159,9 | 14732 → 462 | 41,1 |
| fm_tv_stand_light | ТВ-тумба светлая | Хранение | https://furnimesh.com/library/storage/tv-stand/a-light-wood-midcentury-modern-style-tv-4zqouh/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 150 × 41,3 × 43,6 | 11167 → 294 | 45 |
| fm_tv_stand_walnut | ТВ-тумба ореховая | Хранение | https://furnimesh.com/library/storage/tv-stand/a-long-low-wooden-media-console-featuring-5j7t4f/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 180 × 36 × 38,6 | 13264 → 302 | 43,8 |
| fm_bed_tufted | Кровать мягкая | Кровати | https://furnimesh.com/library/beds/bed/a-modern-upholstered-platform-bed-featuring-a-84flyv/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 187,6 × 214,7 × 103,5 | 13997 → 562 | 41,1 |
| fm_bed_lowprofile | Кровать низкая | Кровати | https://furnimesh.com/library/beds/bed/a-lowprofile-contemporary-platform-bed-featuring-a-k8zcy9/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 173,5 × 209,4 × 66,7 | 22667 → 977 | 38,9 |
| fm_wardrobe_wood | Шкаф платяной деревянный | Хранение | https://furnimesh.com/library/storage/wardrobe/a-tall-rectangular-freestanding-wardrobe-cabinet-featuring-nzutif/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 99,9 × 51,1 × 200 | 9334 → 189 | 48,8 |
| kenney_dryer | Сушильная машина | Бытовая техника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 60 × 60 × 85 | 17 → 8 | нет текстур |
| kenney_washerDryerStacked | Стиральная и сушильная машины (колонна) | Бытовая техника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 60 × 60 × 185 | 63 → 21 | нет текстур |
| kenney_televisionModern | Телевизор современный | Электроника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 100 × 18,7 × 66,4 | 6 → 4 | нет текстур |
| kenney_televisionVintage | Телевизор ламповый | Электроника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 50 × 32,9 × 32,9 | 19 → 8 | нет текстур |
| kenney_speaker | Колонка напольная | Электроника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 23,3 × 23,3 × 100 | 15 → 6 | нет текстур |
| kenney_laptop | Ноутбук | Электроника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 34 × 30,9 × 20,8 | 5 → 4 | нет текстур |
| kenney_computerScreen | Монитор | Электроника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 55 × 14,6 × 41,2 | 6 → 4 | нет текстур |
| kenney_radio | Радиоприёмник | Электроника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 30 × 9,3 × 21,7 | 24 → 8 | нет текстур |
| kenney_toaster | Тостер | Бытовая техника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 28 × 14,9 × 19,4 | 15 → 6 | нет текстур |
| kenney_kitchenMicrowave | Микроволновая печь | Бытовая техника | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 45 × 35,7 × 27,9 | 11 → 8 | нет текстур |
| kenney_lampSquareFloor | Торшер квадратный | Освещение | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 20,9 × 20,9 × 150 | 5 → 3 | нет текстур |
| kenney_lampRoundTable | Настольная лампа круглая | Освещение | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 20,3 × 23,5 × 42 | 6 → 4 | нет текстур |
| kenney_lampSquareTable | Настольная лампа квадратная | Освещение | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 15,7 × 15,7 × 38 | 5 → 4 | нет текстур |
| kenney_lampWall | Бра настенное | Освещение | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 24 × 15,9 × 9,8 | 5 → 4 | нет текстур |
| kenney_lampSquareCeiling | Плафон потолочный | Люстры | https://kenney.nl/assets/furniture-kit | Kenney | CC0 1.0 | не требуется | 2026-11-15 | 30 × 30 × 57,5 | 5 → 4 | нет текстур |
| own_chandelier_classic | Люстра классическая | Люстры | scripts/catalog/make-lights.mjs (собственная модель проекта) | Проект (собственная модель) | Собственная работа проекта | Не требуется | 2026-11-19 | 45,2 × 42 × 71 | 217 → 63 | 99 |
| own_chandelier_round | Люстра круглая современная | Люстры | scripts/catalog/make-lights.mjs (собственная модель проекта) | Проект (собственная модель) | Собственная работа проекта | Не требуется | 2026-11-19 | 62,8 × 62,8 × 49 | 94 → 31 | 99 |
| fm_tv_wall | ТВ-стенка подвесная | Хранение | https://furnimesh.com/library/storage/tv-stand/a-modern-floating-wallmounted-entertainment-unit-featuring-d53vp5/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 200 × 29,6 × 175,1 | 10963 → 263 | 43,6 |
| own_tv_wall | Телевизор на стену | Электроника | scripts/catalog/make-lights.mjs (собственная модель проекта) | Проект (собственная модель) | Собственная работа проекта | Не требуется | 2026-11-19 | 110 × 3,6 × 64 | 3 → 2 | 99 |
| own_picture | Картина | Декор | scripts/catalog/make-lights.mjs (собственная модель проекта) | Проект (собственная модель) | Собственная работа проекта | Не требуется | 2026-11-19 | 60 × 2,6 × 80 | 4 → 4 | 99 |
| own_mirror | Зеркало настенное | Декор | scripts/catalog/make-lights.mjs (собственная модель проекта) | Проект (собственная модель) | Собственная работа проекта | Не требуется | 2026-11-19 | 50 × 3,2 × 120 | 3 → 2 | 99 |
| own_shelf_wall | Полка настенная | Хранение | scripts/catalog/make-lights.mjs (собственная модель проекта) | Проект (собственная модель) | Собственная работа проекта | Не требуется | 2026-11-19 | 80 × 20 × 15 | 6 → 3 | 99 |
| own_clock_wall | Часы настенные | Декор | scripts/catalog/make-lights.mjs (собственная модель проекта) | Проект (собственная модель) | Собственная работа проекта | Не требуется | 2026-11-19 | 32 × 4,8 × 32 | 26 → 9 | 99 |
| fm_planter_fluted | Кашпо рифлёное | Декор | https://furnimesh.com/library/decor/planter/a-large-offwhite-planter-with-a-textured-qc84ld/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 45 × 44,3 × 43,7 | 14085 → 400 | 40,8 |
| fm_plant_peperomia | Пеперомия в керамическом горшке | Декор | https://furnimesh.com/library/decor/plant/a-small-potted-plant-likely-a-peperomia-ezhiyc/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 26,7 × 26,9 × 35 | 40872 → 1930 | 35,7 |
| fm_basket_seagrass | Корзина плетёная | Декор | https://furnimesh.com/library/decor/basket/a-rectangular-woven-basket-with-two-loop-ek94ik/ | FurniMesh (ИИ-генерация по фото пользователя, автор не указан) | FurniMesh: бесплатно, коммерческое использование (не CC0) | Не требуется (по заявлению FurniMesh) | 2026-11-16 | 39,8 × 38,7 × 28,6 | 21610 → 2160 | 37,6 |

Всего 78 предметов; вес исходников 244,1 МБ → GLB 19,4 МБ. Габариты измерены по геометрии готового GLB; PSNR — худшая из текстур цвета после сжатия против исходной (порог 35 дБ).

**Kenney Furniture Kit** (https://kenney.nl/assets/furniture-kit, CC0, автор Kenney; архив скачан вручную пользователем, его лицензия — `License.txt` в архиве). Набор стилизован и заметно мельче реальной мебели, поэтому каждая модель приведена к реальным габаритам: одно значение в перечне (`scripts/catalog/items.mjs`) — равномерный масштаб, три — осевой (только для «коробочных» предметов). Начало координат перенесено в центр основания, перед модели — +Z.

| Модель | Файл набора | Исходный размер, см (Ш × Г × В) | Масштаб по осям x × y × z | Итоговый размер, см (Ш × Г × В) |
|---|---|---|---|---|
| kenney_bathtub | bathtub.glb | 119 × 42 × 56 | 1,429 × 1,429 × 1,429 | 170 × 80 × 60 |
| kenney_bathroomSink | bathroomSink.glb | 34 × 56 × 29 | 1,518 × 1,518 × 1,518 | 51,6 × 44 × 85 |
| kenney_toilet | toilet.glb | 31,3 × 45,1 × 47,7 | 1,467 × 1,467 × 1,467 | 45,8 × 70 × 66,2 |
| kenney_shower | shower.glb | 56,2 × 109,4 × 58,2 | 1,828 × 1,828 × 1,828 | 102,7 × 106,4 × 200 |
| kenney_washer | washer.glb | 39 × 47 × 39 | 1,538 × 1,809 × 1,538 | 60 × 60 × 85 |
| kenney_trashcan | trashcan.glb | 20,8 × 42,8 × 23,4 | 1,052 × 1,052 × 1,052 | 21,8 × 24,6 × 45 |
| kenney_bedDouble | bedDouble.glb | 95,6 × 37,5 × 112,5 | 1,778 × 1,778 × 1,778 | 170 × 200 × 66,7 |
| kenney_bedSingle | bedSingle.glb | 57,1 × 37,5 × 112,5 | 1,778 × 1,778 × 1,778 | 101,5 × 200 × 66,7 |
| kenney_cabinetBed | cabinetBed.glb | 26,6 × 23,3 × 21,5 | 2,144 × 2,144 × 2,144 | 57 × 46,1 × 50 |
| kenney_bookcaseClosedDoors | bookcaseClosedDoors.glb | 40 × 85 × 25 | 2,353 × 2,353 × 2,353 | 94,1 × 58,8 × 200 |
| kenney_kitchenFridge | kitchenFridge.glb | 43 × 92 × 29,2 | 1,395 × 1,848 × 2,227 | 60 × 65 × 170 |
| kenney_kitchenStove | kitchenStove.glb | 43 × 45 × 45 | 1,395 × 2 × 1,333 | 60 × 60 × 90 |
| kenney_kitchenSink | kitchenSink.glb | 43 × 49 × 45 | 1,395 × 1,837 × 1,333 | 60 × 60 × 90 |
| kenney_kitchenCabinet | kitchenCabinet.glb | 43 × 45 × 45 | 1,395 × 2 × 1,333 | 60 × 60 × 90 |
| kenney_coatRackStanding | coatRackStanding.glb | 27,3 × 77 × 27,3 | 2,208 × 2,208 × 2,208 | 60,2 × 60,2 × 170 |
| kenney_lampRoundFloor | lampRoundFloor.glb | 15,2 × 86 × 17,6 | 1,86 × 1,86 × 1,86 | 28,3 × 32,7 × 160 |
| kenney_cabinetTelevision | cabinetTelevision.glb | 80 × 31 × 25 | 1,75 × 1,75 × 1,75 | 140 × 43,7 × 54,2 |
| kenney_dryer | dryer.glb | 39 × 47 × 38 | 1,538 × 1,809 × 1,579 | 60 × 60 × 85 |
| kenney_washerDryerStacked | washerDryerStacked.glb | 39 × 94 × 39 | 1,538 × 1,968 × 1,538 | 60 × 60 × 185 |
| kenney_televisionModern | televisionModern.glb | 68,5 × 45,5 × 12,8 | 1,46 × 1,46 × 1,46 | 100 × 18,7 × 66,4 |
| kenney_televisionVintage | televisionVintage.glb | 41 × 27 × 27 | 1,22 × 1,22 × 1,22 | 50 × 32,9 × 32,9 |
| kenney_speaker | speaker.glb | 14,8 × 63,6 × 14,8 | 1,571 × 1,571 × 1,571 | 23,3 × 23,3 × 100 |
| kenney_laptop | laptop.glb | 26,4 × 16,2 × 24 | 1,288 × 1,288 × 1,288 | 34 × 30,9 × 20,8 |
| kenney_computerScreen | computerScreen.glb | 39,3 × 29,4 × 10,4 | 1,401 × 1,401 × 1,401 | 55 × 14,6 × 41,2 |
| kenney_radio | radio.glb | 31,5 × 22,8 × 9,8 | 0,952 × 0,952 × 0,952 | 30 × 9,3 × 21,7 |
| kenney_toaster | toaster.glb | 18,8 × 13 × 10 | 1,489 × 1,489 × 1,489 | 28 × 14,9 × 19,4 |
| kenney_kitchenMicrowave | kitchenMicrowave.glb | 29 × 18 × 23 | 1,552 × 1,552 × 1,552 | 45 × 35,7 × 27,9 |
| kenney_lampSquareFloor | lampSquareFloor.glb | 12 × 86 × 12 | 1,744 × 1,744 × 1,744 | 20,9 × 20,9 × 150 |
| kenney_lampRoundTable | lampRoundTable.glb | 15,2 × 31,4 × 17,6 | 1,337 × 1,337 × 1,337 | 20,3 × 23,5 × 42 |
| kenney_lampSquareTable | lampSquareTable.glb | 12 × 29 × 12 | 1,31 × 1,31 × 1,31 | 15,7 × 15,7 × 38 |
| kenney_lampWall | lampWall.glb | 22,7 × 9,3 × 15 | 1,059 × 1,059 × 1,059 | 24 × 15,9 × 9,8 |
| kenney_lampSquareCeiling | lampSquareCeiling.glb | 12 × 23 × 12 | 2,5 × 2,5 × 2,5 | 30 × 30 × 57,5 |

**FurniMesh** (https://furnimesh.com/library/, скачано 2026-11-16 с согласия пользователя). Модели сгенерированы нейросетью FurniMesh по фото пользователей сайта; автор и исходное фото не указаны. Лицензии в виде отдельного текста нет: сайт заявляет, что файлы библиотеки бесплатны и допускают коммерческое использование без указания авторства (главная страница и страницы моделей; условия https://furnimesh.com/terms/ библиотеку отдельно не описывают). Это не CC0: при публикации проекта условия стоит перепроверить. Масштаб в файлах произвольный, поэтому реальный размер задан в `scripts/catalog/items.mjs` (равномерный масштаб по одной оси); геометрия упрощена meshoptimizer, текстуры 2048 px → WebP (при 1024 px PSNR ниже 35 дБ). Исходники — `assets-src/furnimesh/<id>/source.glb`. Скачаны, но не включены: fm_table_lamp_velvet (дефекты абажура, не упрощается), fm_desk_black (угловой стол 290 × 140 см), fm_wall_lamp_travertine (бра: настенный монтаж с высотой — этап 21), fm_vanity_walnut (брак генерации: бесформенные куски внутри, нет фасада).

| Модель | Страница | Масштаб, задано | Поворот, ° | Треугольников до → после | Итоговый размер, см (Ш × Г × В) |
|---|---|---|---|---|---|
| fm_floor_lamp_arc | https://furnimesh.com/library/lighting/floor-lamp/a-modern-arc-floor-lamp-featuring-a-4cdk85/ | 1,792 | 0 | 294500 → 19996 | 46,7 × 148,2 × 180 |
| fm_table_lamp_wood | https://furnimesh.com/library/lighting/table-lamp/a-modern-table-lamp-featuring-a-solid-xm42tw/ | 0,498 | 0 | 276606 → 20000 | 40,4 × 40,4 × 50 |
| fm_desk_oak | https://furnimesh.com/library/tables/desk/a-contemporary-desk-crafted-from-light-oak-ynjo42/ | 1,196 | 0 | 291038 → 20000 | 120 × 57 × 78,8 |
| fm_floor_lamp_pleated | https://furnimesh.com/library/lighting/floor-lamp/a-tall-floor-lamp-featuring-a-tapered-v2gqrf/ | 1,594 | 0 | 298304 → 20000 | 40,7 × 40,8 × 159,9 |
| fm_tv_stand_light | https://furnimesh.com/library/storage/tv-stand/a-light-wood-midcentury-modern-style-tv-4zqouh/ | 1,494 | 0 | 291503 → 20000 | 150 × 41,3 × 43,6 |
| fm_tv_stand_walnut | https://furnimesh.com/library/storage/tv-stand/a-long-low-wooden-media-console-featuring-5j7t4f/ | 1,794 | 0 | 298146 → 20000 | 180 × 36 × 38,6 |
| fm_bed_tufted | https://furnimesh.com/library/beds/bed/a-modern-upholstered-platform-bed-featuring-a-84flyv/ | 2,142 | 0 | 296264 → 24756 | 187,6 × 214,7 × 103,5 |
| fm_bed_lowprofile | https://furnimesh.com/library/beds/bed/a-lowprofile-contemporary-platform-bed-featuring-a-k8zcy9/ | 2,096 | 0 | 285369 → 41713 | 173,5 × 209,4 × 66,7 |
| fm_wardrobe_wood | https://furnimesh.com/library/storage/wardrobe/a-tall-rectangular-freestanding-wardrobe-cabinet-featuring-nzutif/ | 1,993 | 0 | 284213 → 19998 | 99,9 × 51,1 × 200 |
| fm_tv_wall | https://furnimesh.com/library/storage/tv-stand/a-modern-floating-wallmounted-entertainment-unit-featuring-d53vp5/ | 1,992 | 0 | 287645 → 20000 | 200 × 29,6 × 175,1 |
| fm_planter_fluted | https://furnimesh.com/library/decor/planter/a-large-offwhite-planter-with-a-textured-qc84ld/ | 0,448 | 0 | 299552 → 20000 | 45 × 44,3 × 43,7 |
| fm_plant_peperomia | https://furnimesh.com/library/decor/plant/a-small-potted-plant-likely-a-peperomia-ezhiyc/ | 0,349 | 0 | 283115 → 77344 | 26,7 × 26,9 × 35 |
| fm_basket_seagrass | https://furnimesh.com/library/decor/basket/a-rectangular-woven-basket-with-two-loop-ek94ik/ | 0,401 | 0 | 293849 → 99152 | 39,8 × 38,7 × 28,6 |
<!-- catalog:end -->

## Отделка стен (этап 12, SPEC §13, D-24)

**Обои.** Роль обоев выполняют бесплатные текстуры тканей Poly Haven (решение пользователя; готовых обоев на Poly Haven нет). Файлы лежат в `public/textures/wallpaper/<id>/` (`<id>_diff_1k.webp` — цвет, `<id>_nor_gl_1k.webp` — нормали OpenGL, `<id>_thumb.webp` — миниатюра 96 px для списка), скачаны 2026-11-15 с `dl.polyhaven.org` по разрешению пользователя в JPG и на этапе 28 переведены в WebP (7,0 МБ → 2,5 МБ, `scripts/catalog/wallpaper-webp.mjs`). Физический размер образца взят из каталога Poly Haven (`dimensions`, мм → см); текстуры бесшовные.

| Материал | Источник | Авторы | Лицензия | Авторство | Образец, см (Ш×В) | Средний цвет | Вес diff / nor, КБ |
|---|---|---|---|---|---|---|---|
| rough_linen («Лён голубой») | https://polyhaven.com/a/rough_linen | colormass, Rico Cilliers | CC0 1.0 | не требуется | 27,1 × 27,1 | #90aacd | 816 / 895 |
| quatrefoil_jacquard_fabric («Жаккард бордовый») | https://polyhaven.com/a/quatrefoil_jacquard_fabric | colormass, Rico Cilliers | CC0 1.0 | не требуется | 28,0 × 28,4 | #93021f | 568 / 898 |
| gingham_check («Клетка зелёная») | https://polyhaven.com/a/gingham_check | colormass, Rico Cilliers | CC0 1.0 | не требуется | 28,4 × 29,7 | #7c9388 | 943 / 922 |
| poly_wool_herringbone («Ёлочка серая») | https://polyhaven.com/a/poly_wool_herringbone | colormass, Rico Cilliers | CC0 1.0 | не требуется | 27,0 × 27,6 | #797671 | 921 / 1021 |

Средний цвет измерен по `diff_1k` (исходный JPG); он служит образцом на плане и в списках. Цвета тканей заметно отличаются от привычных «обойных» (лён голубой, жаккард тёмно-красный): это свойство исходных сканов, не ошибка.

**Краска.** 12 образцов без текстур, цвет задан кодом (`src/catalog/materials.ts`), собственные, ограничений лицензии нет. Различимость цветов проверена тестом (расстояние в RGB больше 18). Точное воспроизведение цвета реальной краски на мониторе не обещается (SPEC §13).

## Открытые вопросы по лицензиям

- FurniMesh: лицензия не указана; вопрос закрывается до публичного запуска (SPEC §12). Модели FurniMesh в проект пока не добавлены.
