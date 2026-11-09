// Examples for every word pattern in lang/*.yml. Each pattern must find at least one example, and each
// example must be found by its concept, so a pattern that is removed or broken fails here even when no
// rule's fixture uses that exact wording. Examples are written as on a page; they are normalized first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { availableLanguages, loadLanguages } from "./lang.ts";
import { normalize } from "./text.ts";

type Examples = Record<string, string[]>;

const EXAMPLES: Record<string, { links: Examples; text: Examples }> = {
  de: {
    links: {
      imprint: ["Impressum", "Anbieterkennzeichnung"],
      privacy: ["Datenschutzerklärung", "Datenschutz"],
      terms: ["AGB", "Allgemeine Geschäftsbedingungen"],
      withdrawal_info: ["Widerrufsbelehrung", "Widerrufsrecht", "Widerrufsinformationen"],
      cancel: ["Verträge hier kündigen"],
      cancel_similar: ["Abo jetzt kündigen", "Kündigen Sie Ihr Abonnement", "Kündigungsformular"],
      withdraw: ["Vertrag widerrufen", "Verträge hier widerrufen"],
      withdraw_similar: ["Widerrufsformular"],
      consent_accept: ["Akzeptieren", "Einverstanden", "Alle Cookies zulassen"],
      consent_reject: ["Ablehnen", "Nur notwendige", "Weiter ohne Einwilligung", "Verweigern"],
      consent_settings: ["Cookie-Einstellungen", "Cookies verwalten", "Widerruf der Einwilligung"],
    },
    text: {
      cancel_confirm: ["Jetzt kündigen"],
      withdraw_confirm: ["Widerruf bestätigen"],
      order_button: ["Zahlungspflichtig bestellen", "Kostenpflichtigen Vertrag abschließen", "Jetzt kaufen"],
      order_wrong: ["Jetzt verbindlich bestellen", "Bestellung absenden"],
      order_generic: ["Weiter"],
      checkout_payment: ["Zahlungsarten"],
      checkout_total: ["Gesamtsumme"],
      shop: ["Warenkorb", "Einkaufswagen", "Zur Kasse", "Jetzt bestellen", "Checkout"],
      vat_included: ["inkl. MwSt.", "MwSt. enthalten", "gemäß § 19 UStG", "Kleinunternehmerregelung"],
      shipping_costs: ["zzgl. Versand", "Versandkosten", "Kostenloser Versand", "Versand & Zahlung"],
      base_price: ["Grundpreis"],
      lowest_price: ["niedrigster Preis innerhalb von 30 Tagen", "30-Tage-Bestpreis", "in den letzten 30 Tagen"],
      rrp: ["UVP", "unverbindliche Preisempfehlung"],
      withdrawal_instruction: ["Widerrufsbelehrung", "Widerrufsrecht"],
      model_form: ["Muster-Widerrufsformular", "Hiermit widerrufe(n) ich/wir"],
      withdraw_function_hint: ["Widerrufsfunktion", "Ihr Widerrufsrecht bequem online", "online widerrufen", "Button „Vertrag widerrufen“"],
      contact_form: ["Kontaktformular"],
      controller: ["Verantwortlich für die Datenverarbeitung", "Verantwortliche Stelle"],
      legal_basis: ["Rechtsgrundlage", "Art. 6 DSGVO"],
      storage_period: ["Speicherdauer", "Dauer der Speicherung", "gespeichert, bis", "Löschfristen", "werden automatisch gelöscht", "nach 14 Tagen"],
      right_access: ["Auskunft"],
      right_rectification: ["Berichtigung"],
      right_erasure: ["Löschung"],
      right_restriction: ["Einschränkung"],
      right_portability: ["Datenübertragbarkeit", "Daten in einem gängigen Format übertragen", "Übertragung Ihrer Daten", "Kopie Ihrer Daten"],
      right_objection: ["Widerspruchsrecht", "widersprechen"],
      right_complaint: ["Aufsichtsbehörde"],
      withdraw_consent: ["Widerruf"],
      third_country: ["Drittland", "Drittstaaten", "USA", "Vereinigte Staaten", "Data Privacy Framework", "Angemessenheitsbeschluss", "Standardvertragsklauseln", "außerhalb der Europäischen Union", "außerhalb des EWR"],
      consent_optional: ["Statistik", "Analyse", "Marketing", "Werbung", "Personalisierung", "Externe Medien", "Komfort"],
      consent_shaming: ["Nein, ich möchte keine besseren Angebote", "Ich möchte nicht sparen", "Ich zahle lieber den vollen Preis", "Ich bevorzuge eine schlechtere Website"],
      placeholder: ["Max Mustermann", "Musterstraße 1", "12345 Musterstadt", "Musterfirma GmbH", "Lorem ipsum dolor sit amet", "[Firmenname]", "info@beispiel.de", "Telefon: +49 123 456789", "Tel. 0123 / 456 78", "Fax 01234-56789", "USt-IdNr.: DE 123 456 789"],
    },
  },
  en: {
    links: {
      imprint: ["Imprint", "Legal notice", "Site notice"],
      privacy: ["Privacy policy", "Data protection"],
      terms: ["Terms and conditions", "Terms of service", "General terms"],
      withdrawal_info: ["Right of withdrawal", "Withdrawal policy"],
      cancel: ["Cancel contracts here"],
      cancel_similar: ["Cancel your subscription", "Cancellation"],
      withdraw: ["Withdraw from the contract here"],
      withdraw_similar: ["Withdrawal form"],
      consent_accept: ["Accept all cookies", "I agree"],
      consent_reject: ["Reject all", "Necessary cookies only", "Only essential", "Continue without accepting"],
      consent_settings: ["Cookie settings", "Manage your cookies"],
    },
    text: {
      cancel_confirm: ["Cancel now"],
      withdraw_confirm: ["Confirm withdrawal"],
      contact_form: ["Contact form"],
      order_button: ["Buy with obligation to pay", "Place order and pay", "Buy now"],
      order_wrong: ["Place order", "Submit order"],
      order_generic: ["Continue"],
      checkout_payment: ["Payment method"],
      checkout_total: ["Order total"],
      shop: ["Add to cart", "Checkout", "Buy now"],
      vat_included: ["incl. VAT", "VAT included"],
      shipping_costs: ["plus shipping", "Shipping costs", "Free delivery"],
      base_price: ["Unit price", "Price per kg"],
      lowest_price: ["Lowest price in 30 days", "in the last 30 days"],
      rrp: ["RRP", "Recommended retail price"],
      withdrawal_instruction: ["Right of withdrawal", "Right to withdraw"],
      model_form: ["Model withdrawal form", "I hereby give notice that I"],
      withdraw_function_hint: ["Withdrawal function", "Withdraw your order online", "Click \"Withdraw from contract\""],
      controller: ["Controller", "Responsible"],
      legal_basis: ["Legal basis", "Article 6 GDPR"],
      storage_period: ["Data retention", "We retain", "Storage period", "stored until", "is automatically deleted", "after 30 days"],
      right_access: ["Access"],
      right_rectification: ["Rectification", "Correct"],
      right_erasure: ["Erasure", "Delete"],
      right_restriction: ["Restriction"],
      right_portability: ["Portability", "A copy of your data"],
      right_objection: ["Object"],
      right_complaint: ["Supervisory authority", "Data protection authority"],
      withdraw_consent: ["Withdraw", "Revoke"],
      third_country: ["Third countries", "United States", "U.S.", "Data Privacy Framework", "Adequacy decision", "Standard contractual clauses", "outside the European Union", "outside of the EEA"],
      consent_optional: ["Statistics", "Analytics", "Marketing", "Advertising", "Personalization", "External media"],
      consent_shaming: ["No, I don't want better offers", "I don't want to save", "I'd rather pay full price", "I prefer worse ads"],
      placeholder: ["Lorem ipsum dolor sit amet", "John Doe", "Your Company Name", "123 Main Street", "[Company Name]", "hello@example.com", "(555) 123-4567", "555-0199"],
    },
  },
};

// Near misses a concept must not find.
const NOT: Record<string, Examples> = {
  de: { withdraw_similar: ["Widerrufsbelehrung"], order_button: ["Bestellen", "Jetzt kaufen und sparen"], imprint: ["Impressionen"], cancel: ["Kündigen"] },
  en: { withdraw_similar: ["Withdrawn"], order_button: ["Order", "Place order"], imprint: ["Imprinted"], cancel: ["Cancel"] },
};

for (const code of availableLanguages()) {
  test(`lang/${code}.yml: every pattern finds an example, every example is found`, () => {
    const pack = loadLanguages([code]);
    const examples = EXAMPLES[code];
    assert.ok(examples, `no examples for lang/${code}.yml`);
    for (const group of ["links", "text"] as const) {
      assert.deepEqual(Object.keys(examples[group]).sort(), Object.keys(pack[group]).sort(), `${group}: concepts without examples`);
      for (const [concept, patterns] of Object.entries(pack[group])) {
        const texts = examples[group][concept].map(normalize);
        for (const re of patterns) assert.ok(texts.some((t) => re.test(t)), `${group}.${concept}: no example for ${re}`);
        for (const t of texts) assert.ok(patterns.some((re) => re.test(t)), `${group}.${concept}: "${t}" is not found`);
        for (const t of (NOT[code]?.[concept] ?? []).map(normalize)) assert.ok(!patterns.some((re) => re.test(t)), `${group}.${concept}: finds "${t}"`);
      }
    }
  });
}
