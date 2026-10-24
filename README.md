# Cthulhu Player HUD

HUD dla systemu **Call of Cthulhu 7e (CoC7)** w Foundry VTT. Uwzględnia ścieżki ataku CoC7 8.16 w Foundry 14 oraz kontrolki Foundry 12/13. Przycisk znajduje się w grupie **Tokens**, obok narzędzi tokenów. Kliknięcie portretu lub walizki rozwija statystyki i ekwipunek. Zawartość całego okna jest przewijana, dzięki czemu sekcje ekwipunku są dostępne również na niższym ekranie.

## Ekwipunek

- HUD pokazuje postacie, do których bieżący użytkownik ma prawo **Owner / Właściciel**. MG widzi wszystkie postacie.
- Wybierz inną postać lub pojazd i kliknij **Pokaż ekwipunek**, aby dodać jego ekwipunek. Strzałki **↑ / ↓** przy nagłówku zmieniają kolejność dodatkowych ekwipunków; wybór i kolejność są zapamiętywane osobno dla każdego użytkownika. Ekwipunek wybranego badacza jest zawsze na samym końcu.
- **+ Sekcja** dodaje np. plecak albo bagażnik w ekwipunku danego aktora. Usunięcie sekcji przenosi jej zawartość do sekcji podstawowej; nie usuwa przedmiotów.
- Strzałki **↑ / ↓** przy nazwach sekcji zmieniają ich kolejność dla danego aktora. Sekcja **Ekwipunek ogólny** pozostaje ostatnia, również w ekwipunku pojazdu. Starsze sekcje i przypisania przedmiotów są zachowywane.
- Kafelki obejmują typy CoC7 `item`, `weapon`, `armor` i `book`. Umiejętności, zaklęcia i dane tworzenia postaci nie są liczone jako przedmioty. Najazd pokazuje ikonę, nazwę, ilość, wagę i stan wyposażenia. Dwuklik otwiera kartę przedmiotu.
- Prawy przycisk na każdym kafelku otwiera menu: **Edytuj** otwiera tę samą kartę co dwuklik, **Usuń** usuwa cały przedmiot lub stos z ekwipunku, a **Wyposaż** przypisuje niewyposażony przedmiot do pierwszego wolnego slotu broni, noża lub pancerza albo do pozostałych rzeczy przy sobie, zgodnie z kategorią w konfiguracji. Zajęte sloty nie są zastępowane. Wyposażanie rzeczy z pojazdu przenosi je do aktualnie wybranego badacza. **Przenieś do ekwipunku ▸** rozwija listę pozostałych postaci i pojazdów z prawem właściciela, także niewyświetlonych w HUD-zie; rzeczy trafiają do ich ekwipunku ogólnego. Wyposażanie i przekazywanie stosu zachowuje wybór liczby sztuk. Menu zamyka się po kliknięciu poza nim lub po Escape; można poruszać się po nim strzałkami.
- Przy przeciąganiu stosu zwykłych przedmiotów CoC7 (`item`) pojawia się wybór liczby sztuk: **Przenieś**, **Cały stos** lub **Anuluj**. Można np. wyposażyć 1 lek z 6, zostawiając 5 w źródłowej sekcji. Działa to między sekcjami, wyposażeniem i aktorami. Pojedyncze przedmioty i bronie przenoszą się bez pytania o ilość.
- Upuszczenie na zgodny stos łączy z nim wybrane sztuki, zachowując docelowy kafelek. Zgodne stosy w tym samym obszarze łączą się też automatycznie. Zgodność obejmuje dane przedmiotu, opis, ikonę i właściwości; sama nazwa nie wystarcza. Stosy odłożone i wyposażone pozostają oddzielne, dopóki nie zostaną przeniesione lub połączone.
- Transfer między aktorami wymaga prawa właściciela do obu aktorów. Przeciągnięcie z katalogu przedmiotów świata kopiuje wybraną liczbę sztuk wzorca do ekwipunku, zachowując wzorzec.
- Zmiany przedmiotów, aktorów i konfiguracji odświeżają otwarty HUD również na pozostałych klientach przez standardową synchronizację Foundry.

## Wyposażenie i testy broni

Domyślnie każda postać ma **4 sloty broni, 1 slot noża i 1 slot pancerza**. Przeciągnij kafelek do pasującego slotu. Zajęty slot trzeba najpierw zwolnić przyciskiem **×**, chyba że łączysz zgodne stosy. Zdjęcie wyposażenia pozostawia przedmiot w ekwipunku. Przeciągnięcie kafelka ze slotu do sekcji również je zdejmuje.

Obszar **Pozostałe przedmioty przy sobie** mieści zwykłe przedmioty, np. latarkę, amunicję lub książkę, bez limitu liczby kafelków. Przeciągnięcie rzeczy tutaj oznacza wyposażenie wybranej liczby sztuk. **×** odkłada cały wyposażony stos do jego sekcji i łączy ze zgodnym odłożonym stosem. Przeciągnięcie do sekcji pozwala odłożyć wybraną liczbę sztuk. Ten sam egzemplarz nie może być wyposażony dwukrotnie.

Na górze wyposażenia widać **ciężar w kg, limit udźwigu i liczbę wyposażonych sztuk**. Waga w konfiguracji i na kafelku dotyczy **jednej sztuki** i jest oznaczona **kg/szt.** Podpowiedź podaje także łączny ciężar stosu. Do obciążenia badacza liczą się wyłącznie aktywnie wyposażone bronie, noże, pancerze i pozostałe rzeczy przy sobie: `waga jednej sztuki × liczba wyposażonych sztuk`. Zmiana ilości, wag, wyposażenia lub transfer aktualizuje wyliczenie.

W konfiguracji MG może nadać broni kategorię **Nóż**. Nazwy zawierające „knife”, „dagger”, „nóż” lub „sztylet” otrzymują ją domyślnie. Ogólnemu przedmiotowi można nadać kategorię **Pancerz**, również w wersjach CoC7 bez osobnego typu `armor`.

Wywołania `game.CoC7.macros.weaponCheck(...)`, `actor.weaponCheck(...)` oraz `actor.weaponRoll(...)` dla postaci wymagają broni w aktywnym slocie broni lub noża. Obejmuje to kliknięcie broni na karcie postaci w CoC7 8.16, które wywołuje bezpośrednio `weaponRoll`. Sama obecność w plecaku nie wystarcza. Brak wyposażenia wyświetla komunikat i kończy wywołanie **przed kodem systemu tworzącym kartę czatu**. Nie ma wyjątku dla postaci obsługiwanych przez MG; inne typy aktorów zachowują działanie systemu.

Jedyny wyjątek od wymogu wyposażenia to broń o dokładnej nazwie **`Punch`**. Działa z makra i z karty postaci bez zajmowania slotu. Sprawdzana jest nazwa rzeczywistego przedmiotu aktora, więc podanie `name: 'Punch'` w makrze innej broni nie omija kontroli.

Sprawdzany jest konkretny UUID przedmiotu. Nieaktualny UUID osadzonego przedmiotu nie jest zastępowany inną bronią o tej samej nazwie. Przeniesienie między aktorami tworzy nowy UUID — makro odnoszące się do wcześniejszego UUID należy ponownie przeciągnąć na pasek makr. Makra wzorców świata/kompendium i wywołania po nazwie wymagają jednoznacznie pasującej broni w ekwipunku.

Przeniesiona broń otrzymuje powiązanie z pasującą umiejętnością aktora docelowego. Jeżeli takiej umiejętności nie ma, należy dodać ją na karcie postaci; HUD nie tworzy umiejętności automatycznie. Transfer broni między ekwipunkami korzysta ze standardowego tworzenia dokumentu Item z aktorem docelowym jako rodzicem, z zachowaniem walidacji i zdarzeń Foundry. Nie uruchamia automatycznego importu umiejętności CoC7, który może powodować błąd `Cannot read properties of undefined (reading 'keys')`. Amunicja, obrażenia i pozostałe dane broni są zachowywane.

## Wagi, udźwig i konfiguracja

Otwórz **Ustawienia → Ustawienia modułów → Cthulhu player Hud → Konfiguruj ekwipunek** albo przycisk zębatki w HUD-zie MG. Na samej górze formularza znajdują się przyciski **Eksport wag JSON** i **Import wag JSON**. Import otwiera wybór pliku; po wczytaniu kliknij **Zapisz**.

- Ustaw wagę jednostkową w **kg**, kategorię slotu oraz liczbę slotów broni, noży i pancerza (0–50). Formularz przyjmuje kropkę i przecinek dziesiętny.
- Katalog obejmuje przedmioty świata oraz osadzone przedmioty wszystkich aktorów. Wspólna waga obowiązuje dla tej samej nazwy i typu, bez rozróżniania wielkości liter i skrajnych spacji. Zmiana nazwy tworzy nowe dopasowanie.
- Pusta waga oznacza **brak danych**, a `0` oznacza znany zerowy ciężar. HUD sygnalizuje niepełne wyliczenie, gdy brakuje wag. Wartość systemowa `system.weight` nie jest używana ani modyfikowana.
- Ciężar przy sobie to suma `waga jednostkowa × ilość` wyłącznie **wyposażonych** przedmiotów aktora, liczonych tylko raz. Rzeczy odłożone w sekcjach nie obciążają badacza. Pojazd pokazuje ciężar całego swojego ładunku; nie obciąża on postaci.
- Udźwig postaci: **U = 0,35 × (0,7 × SIŁA [STR] + 0,3 × BUDOWA [SIZ])**. Dla 80 i 80 wynosi **28 kg**. Brak cech oznacza brak obliczonego limitu. Pojazd pokazuje tylko ciężar.
- Przekroczenie udźwigu jest wyróżniane w HUD-zie; nie nakłada automatycznych kar.
- Zmniejszenie liczby slotów wyłącza przypisania poza aktualnym limitem. Zapis kolejnej zmiany wyposażenia usuwa te nieaktywne przypisania.

**Eksport JSON** zapisuje wartości aktualnie widoczne w formularzu. Plik zawiera `module`, `version: 1`, `unit: "kg"`, `slots` i `catalog`. Można edytować wagi, zachowując nazwy, typy i strukturę. **Import JSON** sprawdza cały plik i scala wpisy po nazwie i typie, zastępując pasujące definicje; pozostałe zachowuje. Zmiany z importu obowiązują po kliknięciu **Zapisz**. Błędny plik nie zmienia ustawień świata.

Wagi i limity przechowywane są w ustawieniu świata `cthulhu-hud.inventoryConfig`, sekcje i wyposażenie we flagach aktora `flags.cthulhu-hud.inventory`, a wybór dodatkowych ekwipunków we flagach użytkownika. Moduł nie zapisuje wag we flagach ani danych przedmiotów.

## Sprawdzenie

Testy bez zależności zewnętrznych: Node.js 18 lub nowszy, następnie `npm test`. Obejmują ciężar tylko wyposażonych sztuk, dzielenie i zgodność stosów, łączenie i cofanie nieudanych transferów, okno wyboru ilości i anulowanie, sloty, kolejność sekcji i ekwipunków, uprawnienia, przypisania umiejętności, blokadę makr, walidację konfiguracji oraz integrację HUD-u z atrapami API Foundry.

Przed użyciem na sesji sprawdź również w uruchomionym świecie CoC7:

1. Przycisk jest w Tokens; HUD rozwija się i pokazuje przedmioty istniejącej postaci.
2. Dwie sesje użytkowników widzą zmiany ilości, sekcji, wyposażenia i wag bez ponownego otwierania HUD-u.
3. Ze stosu 6 leków wyposażyć 1: w źródle zostaje 5, przy sobie jest 1, a obciążenie rośnie o wagę jednej sztuki. Po **×** zgodny stos ma ponownie 6. Sprawdź też podział i łączenie między postacią a pojazdem oraz anulowanie okna ilości.
4. Makro niewyposażonej broni nie tworzy karty czatu; po przypisaniu jej do slotu test działa, także z Shift.
5. Eksport i import zachowują wagę `0`, wagę ułamkową i pustą; błędne dane nie zapisują się.

Testy automatyczne nie zastępują próby w działającym Foundry. Transfer między dwoma aktorami wymaga kilku operacji dokumentów; moduł cofa utworzony egzemplarz po błędzie, ale Foundry nie udostępnia transakcji obejmującej obu aktorów. Nie przenoś jednocześnie tego samego przedmiotu z dwóch klientów.
