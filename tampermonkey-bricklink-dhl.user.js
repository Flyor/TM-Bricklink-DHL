// ==UserScript==
// @name         Bricklink & Amazon → DHL & Iloxx Versanddienstleister Kopierer
// @namespace    https://yourdomain.example/
// @version      1.4.2
// @description  Extrahiert Versanddaten aus Bricklink-Bestellungen und Amazon Seller Central und fügt sie im DHL Geschäftskundenportal und Iloxx ein. Mit Button, JSON-Clipboard und Feldzuordnung. Gewicht wird automatisch umgerechnet. Hinweise werden in Name2 eingetragen. 
// @author       Dein Name
// @match        https://www.bricklink.com/orderDetail.asp*
// @match        https://sellercentral.amazon.de/orders-v3/order/*
// @match        https://sellercentral.amazon.*/orders-v3/order/*
// @match        https://geschaeftskunden.dhl.de/vls/vc/ShipmentDetails*
// @match        https://geschaeftskunden.dhl.de/vls/vc/printByToken/SHIPMENT_LABEL*
// @match        https://www.iloxx.de/sendnow/ppvmanualorder.aspx*
// @icon         https://www.bricklink.com/favicon.ico
// @grant        GM_setClipboard
// @grant        GM_getClipboard
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/Flyor/TM-Bricklink-DHL/main/tampermonkey-bricklink-dhl.user.js
// @downloadURL  https://raw.githubusercontent.com/Flyor/TM-Bricklink-DHL/main/tampermonkey-bricklink-dhl.user.js
// @supportURL   https://github.com/Flyor/TM-Bricklink-DHL
// ==/UserScript==

/*
Changelog v1.4.2 (2025-01-XX)

- Bestellnummer-Format angepasst:
  - Bei Amazon-Bestellungen wird die Bestellnummer OHNE "Order #" Präfix verwendet
  - Bei Bricklink-Bestellungen wird weiterhin "Order #" vor die Bestellnummer gesetzt
  - Gilt für DHL und Iloxx

Changelog v1.4.1 (2025-01-XX)

- Amazon-Anpassungen:
  - Telefonnummer wird nicht mehr aus Amazon kopiert
  - E-Mail-Adresse bei Amazon-Bestellungen wird auf "Paket@Stonehiller.de" gesetzt

Changelog v1.4.0 (2025-01-XX)

- Amazon Seller Central-Unterstützung hinzugefügt:
  - Button auf Amazon-Bestellseiten zum Kopieren der Versanddaten
  - Extrahiert Lieferadresse und Bestellnummer aus Amazon
  - Kompatibel mit bestehender DHL/Iloxx-Integration
  - Bestellnummer wird aus URL oder DOM extrahiert

Changelog v1.3.0 (2024-12-08)

- Iloxx-Unterstützung hinzugefügt:
  - Button auf Iloxx-Versandseite zum Einfügen der Bricklink-Daten
  - Flexible Feldzuordnung für Iloxx-Formularfelder
  - Iloxx benötigt KEIN Gewicht (im Gegensatz zu DHL)
- Kopiervorgang bleibt unverändert (einmal kopieren, mehrfach einfügen möglich)

Changelog v1.2.0 (2024-06-27)

- Gewichtsermittlung komplett überarbeitet:
  - 35g Verpackungspuffer werden automatisch zum ermittelten Gewicht addiert.
  - Das Gesamtgewicht wird auf das nächste volle 100g aufgerundet (z.B. 53g+35g=88g → 100g, 224g+35g=259g → 300g).
  - Umrechnung in kg mit nur einer Nachkommastelle, Komma als Dezimaltrennzeichen (z.B. 0,1 / 0,3 / 1,2).
  - Mindestgewicht ist immer 0,1 kg, auch bei sehr leichten Sendungen.
- Adress-Parsing robust gegen beliebige Zeilenzahl im Adressblock (Name2/Name3 werden nur befüllt, wenn wirklich vorhanden).
- Alle Felder werden gezielt und kompatibel für das DHL Geschäftskundenportal ausgefüllt.
- Debug-Logging für die wichtigsten Schritte und Fehlerquellen.
- Das Skript ist damit für alle gängigen Bricklink-Bestellseiten und DHL-Formate (Stand 2024-06) optimiert.

*/

(function() {
    'use strict';

    // Hilfsfunktionen
    function createButton(text, onClick, id = '') {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.type = 'button';
        btn.style = 'z-index:9999;position:fixed;top:10px;right:10px;padding:8px 16px;background:#e30613;color:#fff;border:none;border-radius:4px;font-size:16px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.2);';
        if (id) btn.id = id;
        btn.addEventListener('click', onClick);
        document.body.appendChild(btn);
        return btn;
    }

    // Clipboard-Helper
    async function setClipboard(text) {
        if (typeof GM_setClipboard === 'function') {
            try { GM_setClipboard(text, {type: 'text'}); return true; } catch(e) {}
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try { await navigator.clipboard.writeText(text); return true; } catch(e) {}
        }
        alert('Konnte nicht in die Zwischenablage schreiben!');
        return false;
    }
    async function getClipboard() {
        if (typeof GM_getClipboard === 'function') {
            try { return await GM_getClipboard({type: 'text'}); } catch(e) {}
        }
        if (navigator.clipboard && navigator.clipboard.readText) {
            try { return await navigator.clipboard.readText(); } catch(e) {}
        }
        alert('Konnte nicht aus der Zwischenablage lesen!');
        return '';
    }

    // Seite: Amazon Seller Central Bestelldetail
    if (window.location.hostname.includes('sellercentral.amazon') && window.location.pathname.includes('/orders-v3/order/')) {
        createButton('Daten für Label kopieren', async () => {
            const data = {};
            
            // --- Order ID ---
            // Aus URL extrahieren: /orders-v3/order/303-6154361-9000313
            const urlMatch = window.location.pathname.match(/\/order\/([^\/]+)/);
            if (urlMatch) {
                data.orderId = urlMatch[1];
            } else {
                // Fallback: Aus DOM extrahieren
                const orderIdEl = document.querySelector('[data-test-id="order-id-value"]');
                if (orderIdEl) {
                    data.orderId = orderIdEl.textContent.trim();
                } else {
                    data.orderId = '';
                }
            }
            
            // --- Lieferadresse ---
            const addressDiv = document.querySelector('[data-test-id="shipping-section-buyer-address"]');
            let buyerName = '', buyerStreet = '', buyerStreetNumber = '', buyerPlz = '', buyerCity = '', buyerCountry = '';
            
            if (addressDiv) {
                // Erstelle ein temporäres Element, um die Adresse sauber zu parsen
                // Ersetze <br> Tags durch Zeilenumbrüche und extrahiere dann die Zeilen
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = addressDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n');
                const fullText = tempDiv.textContent || tempDiv.innerText;
                
                // Zeilen extrahieren und bereinigen
                const lines = fullText
                    .split('\n')
                    .map(line => line.replace(/\s+/g, ' ').trim())
                    .filter(line => line.length > 0);
                
                console.debug('[Amazon] Extrahierte Adresszeilen:', lines);
                
                if (lines.length > 0) {
                    buyerName = lines[0] || '';
                    
                    if (lines.length > 1) {
                        // Straße und Hausnummer (zweite Zeile)
                        const streetLine = lines[1];
                        // Versuche Straße und Hausnummer zu trennen (Hausnummer beginnt mit Zahl)
                        const streetMatch = streetLine.match(/^(.*?)\s+(\d+[a-zA-Z0-9\s\-/]*)$/);
                        if (streetMatch) {
                            buyerStreet = streetMatch[1].trim();
                            buyerStreetNumber = streetMatch[2].trim();
                        } else {
                            // Falls keine Hausnummer gefunden, gesamte Zeile als Straße
                            buyerStreet = streetLine;
                        }
                    }
                    
                    // Suche nach PLZ und Stadt (können in einer Zeile sein: "12345 Berlin" oder getrennt)
                    // Gehe die Zeilen von hinten nach vorne durch, um Land, PLZ/Stadt zu finden
                    for (let i = lines.length - 1; i >= 2; i--) {
                        const line = lines[i].trim();
                        
                        // Prüfe ob es ein Land ist (häufige Länder)
                        if (line.match(/^(Deutschland|Germany|Österreich|Austria|Schweiz|Switzerland|Frankreich|France|Italien|Italy|Spanien|Spain|Niederlande|Netherlands|Belgien|Belgium|Polen|Poland)$/i)) {
                            if (!buyerCountry) buyerCountry = line;
                            continue;
                        }
                        
                        // Prüfe ob PLZ und Stadt in einer Zeile sind (z.B. "12345 Berlin" oder "12345, Berlin")
                        const plzCityMatch = line.match(/^(\d{4,5})[\s,]+(.+)$/);
                        if (plzCityMatch && !buyerPlz && !buyerCity) {
                            buyerPlz = plzCityMatch[1];
                            buyerCity = plzCityMatch[2].replace(/,/g, '').trim();
                            continue;
                        }
                        
                        // Prüfe ob nur PLZ (nur Zahlen, 4-5 Ziffern)
                        if (line.match(/^\d{4,5}$/) && !buyerPlz) {
                            buyerPlz = line;
                            // Nächste Zeile sollte die Stadt sein
                            if (i + 1 < lines.length && !buyerCity) {
                                buyerCity = lines[i + 1].replace(/,/g, '').trim();
                            }
                            continue;
                        }
                        
                        // Prüfe ob nur Stadt (Text ohne Zahlen am Anfang, nicht "Deutschland")
                        if (!line.match(/^\d/) && !line.match(/^(Deutschland|Germany|Österreich|Austria|Schweiz|Switzerland|Frankreich|France|Italien|Italy|Spanien|Spain|Niederlande|Netherlands|Belgien|Belgium|Polen|Poland)$/i) && !buyerCity) {
                            buyerCity = line.replace(/,/g, '').trim();
                        }
                    }
                }
                
                console.debug('[Amazon] Geparste Adressdaten:', {
                    name: buyerName,
                    street: buyerStreet,
                    streetNumber: buyerStreetNumber,
                    plz: buyerPlz,
                    city: buyerCity,
                    country: buyerCountry
                });
            } else {
                console.warn('[Amazon] Lieferadresse nicht gefunden!');
            }
            
            // --- E-Mail (fest für Amazon-Bestellungen) ---
            const buyerEmail = 'Paket@Stonehiller.de';
            
            data.name = buyerName;
            data.name2 = '';
            data.name3 = '';
            data.street = buyerStreet;
            data.streetNumber = buyerStreetNumber;
            data.plz = buyerPlz;
            data.city = buyerCity;
            data.country = buyerCountry;
            data.email = buyerEmail;
            data.weight_g = ''; // Amazon liefert kein Gewicht auf der Bestellseite
            data.source = 'amazon'; // Flag für Amazon-Daten
            
            // In Zwischenablage kopieren (JSON)
            const ok = await setClipboard(JSON.stringify(data));
            if (ok) alert('Amazon-Daten für Versanddienstleister kopiert!');
        }, 'amazon-dhl-copy-btn');
    }

    // Seite: Bricklink Bestelldetail
    if (window.location.hostname.includes('bricklink.com')) {
        // Button einfügen
        createButton('Daten für Label kopieren', async () => {
            const data = {};
            // --- Order ID ---
            // Suche nach Link "Contact your buyer about this order"
            const buyerContact = Array.from(document.querySelectorAll('a[href*="contact.asp?orderID="]')).find(a => a.textContent.includes('Contact your buyer'));
            if (buyerContact) {
                const match = buyerContact.href.match(/orderID=(\d+)/);
                data.orderId = match ? match[1] : '';
            } else {
                data.orderId = '';
            }
            // --- Käuferadresse ---
            // Suche nach <b>Buyer Information</b>
            let buyerName = '', buyerName2 = '', buyerName3 = '', buyerStreet = '', buyerStreetNumber = '', buyerPlz = '', buyerCity = '', buyerCountry = '', buyerEmail = '';
            const buyerInfoHeader = Array.from(document.querySelectorAll('b')).find(b => b.textContent.trim() === 'Buyer Information');
            let buyerTables = [];
            if (buyerInfoHeader) {
                // Alle folgenden Tabellen im DOM suchen (nicht nur direkte Geschwister)
                let el = buyerInfoHeader;
                while (el = el.nextElementSibling) {
                    if (el.tagName === 'TABLE') buyerTables.push(el);
                    if (el.tagName === 'B' && el.textContent.includes('Seller Information')) break;
                }
            }
            const buyerTable = buyerTables[1]; // zweite Tabelle
            if (buyerTable) {
                const tds = buyerTable.querySelectorAll('td');
                // E-Mail
                const emailTd = Array.from(tds).find(td => td.textContent.includes('E-Mail:'));
                if (emailTd && emailTd.nextElementSibling) {
                    const mailLink = emailTd.nextElementSibling.querySelector('a[href^="mailto:"]');
                    if (mailLink) buyerEmail = mailLink.textContent.trim();
                }
                // Name & Address
                const addrTd = Array.from(tds).find(td => td.textContent.includes('Name & Address:'));
                if (addrTd && addrTd.nextElementSibling) {
                    const lines = addrTd.nextElementSibling.innerHTML.split('<br>').map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
                    buyerName = lines[0] || '';
                    // Name2/Name3 nur, wenn mehr als 4 Zeilen vorhanden sind
                    if (lines.length > 4) buyerName2 = lines[1] || '';
                    if (lines.length > 5) buyerName3 = lines[2] || '';
                    // Straße und Hausnummer (immer drittletzte Zeile)
                    const streetLine = lines[lines.length - 3] || '';
                    const streetMatch = streetLine.match(/^(.*)\s+(\d+.*)$/);
                    buyerStreet = streetMatch ? streetMatch[1] : streetLine;
                    buyerStreetNumber = streetMatch ? streetMatch[2] : '';
                    // PLZ und Ort (vorletzte Zeile)
                    const plzOrt = lines[lines.length - 2]?.match(/(\d{4,5})\s+(.+)/);
                    buyerPlz = plzOrt ? plzOrt[1] : '';
                    buyerCity = plzOrt ? plzOrt[2] : '';
                    // Land (letzte Zeile)
                    buyerCountry = lines[lines.length - 1] || '';
                }
            } else {
                console.warn('[Bricklink] Käufer-Tabelle (zweite nach "Buyer Information") nicht gefunden!');
            }
            data.name = buyerName;
            data.name2 = buyerName2;
            data.name3 = buyerName3;
            data.street = buyerStreet;
            data.streetNumber = buyerStreetNumber;
            data.plz = buyerPlz;
            data.city = buyerCity;
            data.country = buyerCountry;
            data.email = buyerEmail;
            // --- Gewicht ---
            // Suche nach "Estimated Weight of Order: ... g" oder "Total Weight: ... g"
            let weight_g = '';
            let weightMatch = document.body.innerHTML.match(/Estimated Weight of Order:[^\d]*(\d+[\.,]?\d*)g/);
            if (!weightMatch) weightMatch = document.body.innerHTML.match(/Total Weight:[^\d]*(\d+[\.,]?\d*)g/);
            if (weightMatch) {
                weight_g = weightMatch[1].replace(',', '.');
            } else {
                // Suche gezielt nach <font class='fv'>Estimated Weight of Order:</font> und folgendem <font class='fv'>...g</font>
                const fonts = Array.from(document.querySelectorAll('font.fv'));
                for (let i = 0; i < fonts.length; i++) {
                    if (fonts[i].textContent.trim() === 'Estimated Weight of Order:') {
                        // Suche im nächsten <font> nach "g"
                        let next = fonts[i].parentElement;
                        while (next && next !== document.body) {
                            // Suche nach <font class='fv'>...g</font>
                            const gFont = next.querySelector && next.querySelector('font.fv');
                            if (gFont && /g$/.test(gFont.textContent.trim())) {
                                const gMatch = gFont.textContent.trim().match(/(\d+[\.,]?\d*)g$/);
                                if (gMatch) {
                                    weight_g = gMatch[1].replace(',', '.');
                                    break;
                                }
                            }
                            next = next.nextElementSibling;
                        }
                        if (weight_g) break;
                    }
                }
            }
            data.weight_g = weight_g;
            // --- Hinweise (z.B. z.Hd. ...) ---
            const infoBlock = Array.from(document.querySelectorAll('td')).find(td => td.innerText.includes('Additional Information'));
            data.info = infoBlock ? infoBlock.nextElementSibling.innerText.trim() : '';
            data.source = 'bricklink'; // Flag für Bricklink-Daten
            // In Zwischenablage kopieren (JSON)
            const ok = await setClipboard(JSON.stringify(data));
            if (ok) alert('Daten für Versanddienstleister kopiert!');
        }, 'bricklink-dhl-copy-btn');
    }

    // Seite: DHL Geschäftskundenportal
    if (window.location.hostname.includes('geschaeftskunden.dhl.de')) {
        createButton('Bricklink/Amazon Import', async () => {
            let dataRaw = await getClipboard();
            let data;
            try {
                data = JSON.parse(dataRaw);
            } catch (e) {
                alert('Keine gültigen Versanddaten in der Zwischenablage gefunden!');
                return;
            }
            // Zuordnung Bricklink → DHL
            function setValue(id, value) {
                const el = document.getElementById(id);
                if (el) {
                    el.focus();
                    // Property-Setter (für React/Angular)
                    const proto = Object.getPrototypeOf(el);
                    const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                    if (valueSetter) valueSetter.call(el, value);
                    else el.value = value;
                    el.dispatchEvent(new Event('input', {bubbles:true}));
                    el.dispatchEvent(new Event('change', {bubbles:true}));
                    el.dispatchEvent(new Event('blur', {bubbles:true}));
                    // Logging für Debugging
                    console.log(`[DHL-Feld] ${id} gesetzt auf:`, value);
                } else {
                    console.warn(`[DHL-Feld] Feld mit id='${id}' nicht gefunden!`);
                }
            }
            // Bestellnummer: Bei Amazon ohne "Order #", bei Bricklink mit "Order #"
            const reference = data.orderId ? (data.source === 'amazon' ? data.orderId : 'Order #' + data.orderId) : '';
            setValue('shipment-reference', reference);
            setValue('receiver.name1', data.name || '');
            setValue('receiver.name2', data.name2 || data.info || '');
            setValue('receiver.name3', data.name3 || '');
            setValue('receiver.street', data.street || '');
            setValue('receiver.streetNumber', data.streetNumber || '');
            setValue('receiver.plz', data.plz || '');
            setValue('receiver.city', data.city || '');
            setValue('receiver-country', data.country || '');
            setValue('receiver.email', data.email || '');
            // Gewicht: g → kg
            let kg = '';
            if (data.weight_g) {
                let raw = parseFloat(data.weight_g.replace(',', '.')) + 35; // 35g Karton
                let rounded = Math.ceil(raw / 100) * 100; // auf nächstes 100g aufrunden
                let num = Math.max(rounded / 1000, 0.1); // in kg, mindestens 0,1
                kg = num.toFixed(1).replace('.', ',');
            }
            setValue('shipment-weight', kg);
            alert('Daten eingefügt! Bitte prüfe die Felder.');
        }, 'dhl-bricklink-paste-btn');
    }

    // Seite: DHL Label-Ansicht (Sendungsnummer kopieren)
    if (window.location.pathname.includes('/printByToken/SHIPMENT_LABEL')) {
        createButton('PDF-Label-Tool', () => {
            alert('Hier kannst du eigene Aktionen hinterlegen (z.B. Drucken, Info, etc.)');
        }, 'dhl-label-tool-btn');
    }

    // Seite: Iloxx Versandformular
    if (window.location.hostname.includes('iloxx.de') && window.location.pathname.includes('/sendnow/ppvmanualorder.aspx')) {
        // Debug-Feature: Zeige alle Formularfelder in der Konsole
        GM_registerMenuCommand('Iloxx: Formularfelder anzeigen', () => {
            const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
            console.group('Iloxx Formularfelder:');
            const fieldInfo = [];
            inputs.forEach((el, idx) => {
                // Suche nach Label auf verschiedene Weise
                let labelText = '';
                if (el.labels && el.labels.length > 0) {
                    labelText = el.labels[0].textContent.trim();
                } else if (el.id) {
                    const labelFor = document.querySelector(`label[for="${el.id}"]`);
                    if (labelFor) labelText = labelFor.textContent.trim();
                }
                if (!labelText) {
                    // Suche nach Label in der Nähe
                    let sibling = el.previousElementSibling;
                    while (sibling && !labelText) {
                        if (sibling.tagName === 'LABEL') {
                            labelText = sibling.textContent.trim();
                            break;
                        }
                        sibling = sibling.previousElementSibling;
                    }
                }
                
                const info = {
                    index: idx + 1,
                    tag: el.tagName,
                    id: el.id || '(keine ID)',
                    name: el.name || '(kein Name)',
                    type: el.type || el.tagName,
                    label: labelText || '(kein Label)',
                    placeholder: el.placeholder || '',
                    selector: el.id ? `#${el.id}` : (el.name ? `[name="${el.name}"]` : '')
                };
                fieldInfo.push(info);
                console.log(`${idx + 1}. ${el.tagName}`, info);
            });
            console.groupEnd();
            console.log('Kopierbare Selektoren:', fieldInfo.map(f => f.selector).filter(s => s).join(', '));
            alert(`Formularfelder wurden in der Konsole ausgegeben (F12 öffnen).\nGefunden: ${inputs.length} Felder`);
        });
        
        createButton('Bricklink/Amazon Import', async () => {
            let dataRaw = await getClipboard();
            let data;
            try {
                data = JSON.parse(dataRaw);
            } catch (e) {
                alert('Keine gültigen Versanddaten in der Zwischenablage gefunden!');
                return;
            }
            
            // Flexible Feldzuordnung für Iloxx (versucht verschiedene Selektoren)
            function setIloxxValue(selectors, value) {
                if (!value) return false;
                for (const selector of selectors) {
                    let el = null;
                    // Versuche verschiedene Selektoren
                    if (selector.startsWith('#')) {
                        el = document.querySelector(selector);
                    } else if (selector.startsWith('name=')) {
                        const name = selector.substring(5);
                        el = document.querySelector(`[name="${name}"]`) || document.querySelector(`input[name="${name}"]`);
                    } else if (selector.startsWith('input[name*=')) {
                        // Case-insensitive Suche nach name-Attributen
                        const namePart = selector.match(/name\*="([^"]+)"/i)?.[1];
                        if (namePart) {
                            const allInputs = Array.from(document.querySelectorAll('input, textarea, select'));
                            el = allInputs.find(input => {
                                const name = (input.name || '').toLowerCase();
                                return name.includes(namePart.toLowerCase());
                            });
                        }
                    } else if (selector.startsWith('label=')) {
                        const labelText = selector.substring(6);
                        // Suche nach Labels (case-insensitive, auch Teilstrings)
                        const labels = Array.from(document.querySelectorAll('label')).filter(l => {
                            const text = l.textContent.trim().toLowerCase();
                            const innerText = l.innerText.trim().toLowerCase();
                            const searchText = labelText.toLowerCase();
                            return text.includes(searchText) || innerText.includes(searchText) ||
                                   text.startsWith(searchText) || innerText.startsWith(searchText);
                        });
                        if (labels.length > 0) {
                            const label = labels[0];
                            const forAttr = label.getAttribute('for');
                            if (forAttr) {
                                el = document.getElementById(forAttr);
                            } else {
                                // Suche nach Input in der Nähe des Labels
                                // Zuerst nach nextElementSibling
                                let next = label.nextElementSibling;
                                while (next && !el) {
                                    if (next.tagName === 'INPUT' || next.tagName === 'TEXTAREA' || next.tagName === 'SELECT') {
                                        el = next;
                                        break;
                                    }
                                    next = next.nextElementSibling;
                                }
                                // Falls nicht gefunden, suche im Parent-Container
                                if (!el) {
                                    const parent = label.parentElement;
                                    if (parent) {
                                        el = parent.querySelector('input, textarea, select');
                                    }
                                }
                                // Falls immer noch nicht gefunden, suche nach folgendem Element im DOM
                                if (!el) {
                                    let current = label;
                                    for (let i = 0; i < 5 && current; i++) {
                                        current = current.nextElementSibling;
                                        if (current) {
                                            const found = current.querySelector('input, textarea, select');
                                            if (found) {
                                                el = found;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        el = document.querySelector(selector);
                    }
                    
                    if (el) {
                        el.focus();
                        // Property-Setter (für React/Angular)
                        const proto = Object.getPrototypeOf(el);
                        const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                        if (valueSetter) valueSetter.call(el, value);
                        else el.value = value;
                        el.dispatchEvent(new Event('input', {bubbles:true}));
                        el.dispatchEvent(new Event('change', {bubbles:true}));
                        el.dispatchEvent(new Event('blur', {bubbles:true}));
                        console.debug(`[Iloxx-Feld] ${selector} gesetzt auf:`, value);
                        return true;
                    }
                }
                console.warn(`[Iloxx-Feld] Kein Feld gefunden für Selektoren:`, selectors);
                return false;
            }
            
            // Feldzuordnungen für Iloxx
            // Basierend auf den tatsächlichen Feld-IDs aus der Debug-Ausgabe
            
            // Nachname: Kompletter Name (Vor- und Nachname zusammen) ins Nachname-Feld
            const fullName = data.name || '';
            setIloxxValue(['#ContentPlaceHolder1_txtLastName', 'name=ctl00$ContentPlaceHolder1$txtLastName'], fullName);
            
            // Firma (Name2 oder Info)
            if (data.name2 || data.info) {
                setIloxxValue(['#ContentPlaceHolder1_txtCompany', 'name=ctl00$ContentPlaceHolder1$txtCompany'], data.name2 || data.info || '');
            }
            
            // PLZ
            setIloxxValue(['#ContentPlaceHolder1_txtZIP', 'name=ctl00$ContentPlaceHolder1$txtZIP'], data.plz || '');
            
            // Stadt
            setIloxxValue(['#ContentPlaceHolder1_txtCity', 'name=ctl00$ContentPlaceHolder1$txtCity'], data.city || '');
            
            // Straße
            setIloxxValue(['#ContentPlaceHolder1_txtStreet', 'name=ctl00$ContentPlaceHolder1$txtStreet'], data.street || '');
            
            // Hausnummer
            setIloxxValue(['#ContentPlaceHolder1_txtHouseNo', 'name=ctl00$ContentPlaceHolder1$txtHouseNo'], data.streetNumber || '');
            
            // Land: Wird nicht gesetzt, da standardmäßig auf Deutschland (nur Versand nach Deutschland)
            
            // E-Mail (falls vorhanden)
            if (data.email) {
                setIloxxValue(['#ContentPlaceHolder1_txtEMail', 'name=ctl00$ContentPlaceHolder1$txtEMail'], data.email);
            }
            
            // Referenz/Bestellnummer (falls vorhanden) - bei Amazon ohne "Order #", bei Bricklink mit "Order #"
            if (data.orderId) {
                const reference = data.source === 'amazon' ? data.orderId : 'Order #' + data.orderId;
                setIloxxValue(['#ContentPlaceHolder1_txtReference_Parcel1', 'name=ctl00$ContentPlaceHolder1$txtReference_Parcel1'], reference);
            }
            
            // Hinweis: Iloxx benötigt KEIN Gewicht (im Gegensatz zu DHL)
            
            alert('Daten eingefügt! Bitte prüfe die Felder. Falls Felder fehlen, öffne die Konsole (F12) für Debug-Informationen.');
        }, 'iloxx-bricklink-paste-btn');
    }
})();