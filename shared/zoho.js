export const ZOHO_FORM_ACTION = 'https://forms.zohopublic.in/jeevankslakeshor1/form/aiworkshop/formperma/v8G1xzWMH1hm0tT3Hwd0tIr-1yfgWIvfK4CwDhJ6S2A/htmlRecords/submit';

// Submit into an isolated background frame so the workshop page stays visible.
export const ZOHO_FORM_TARGET = 'zoho-registration-result';

// These names belong to Zoho's generated form and must not be changed.
export const ZOHO_FIELD_NAMES = [
  'zf_referrer_name', 'zf_redirect_url', 'zc_gad',
  'Name_First', 'Name_Last', 'Email', 'PhoneNumber_countrycode',
  'SingleLine', 'SingleLine2', 'SingleLine1',
];

export function zohoFields(registration) {
  // Only the server's verified, captured payment may populate the payment field.
  if (registration.status !== 'paid' || !registration.payment_id) return null;
  const attendee = JSON.parse(registration.attendee);
  return {
    zf_referrer_name: '', zf_redirect_url: '', zc_gad: '',
    Name_First: attendee.firstName,
    Name_Last: attendee.lastName,
    Email: attendee.email,
    PhoneNumber_countrycode: attendee.phone.replace(/[ ()-]/g, ''),
    SingleLine: attendee.organization,
    SingleLine2: attendee.specialty,
    SingleLine1: JSON.stringify({ status: 'captured', razorpay_payment_id: registration.payment_id, razorpay_order_id: registration.order_id }),
  };
}

export function submitZohoForm(form, fields) {
  for (const name of ZOHO_FIELD_NAMES) {
    form.elements.namedItem(name).value = fields[name] ?? '';
  }
  form.target = ZOHO_FORM_TARGET;
  form.submit();
}
