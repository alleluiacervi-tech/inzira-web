// Phone and email handling shared by server and client code. Pure functions, no imports.

/** A Rwandan mobile number typed after +250: nine digits starting with 7 (a leading 0 or 250 is forgiven). */
export const mobile = (v: string) => v.replace(/\D/g, "").replace(/^250/, "").replace(/^0/, "");
export const isMobile = (v: string) => /^7\d{8}$/.test(mobile(v));
export const prettyMobile = (v: string) => mobile(v).replace(/^(\d{3})(\d{3})(\d{0,3}).*$/, "$1 $2 $3").trim();
/** Nine digits after +250, or null if it is not a Rwandan mobile number. */
export const normalisePhone = (v: string) => (isMobile(v) ? mobile(v) : null);

/** The address in lower case, or null if it does not look like an email address. */
export const normaliseEmail = (v: string) => {
  const email = v.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\.]{2,}$/.test(email) ? email : null;
};
export const isEmail = (v: string) => normaliseEmail(v) !== null;
