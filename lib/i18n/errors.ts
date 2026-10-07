import type { Locale } from "./locale";
import { text } from "./messages";

const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";

/** Known server messages, mapped so the screen can show them in the customer's language. */
const KNOWN: Record<string, string> = {
  "Enter a Rwandan mobile number, e.g. 788 123 456.": "authErr.badPhone",
  "Enter a valid email address, e.g. name@example.com.": "authErr.badEmail",
  "We just sent a code. Wait a few seconds before asking for another.": "authErr.wait",
  "We couldn’t send the email. Please try again in a minute.": "authErr.emailFail",
  "Enter the 6-digit code from the email.": "authErr.digits",
  "That code has expired or isn’t valid. Ask for a new one.": "authErr.expired",
  "Too many wrong codes. Ask for a new one.": "authErr.tooManyWrong",
  "That code is not right. Check the email and try again.": "authErr.wrong",
  [TOO_MANY]: "authErr.tooMany",
  "We couldn’t send the code. Check your connection and try again.": "authErr.sendFail",
  "We couldn’t send your request. Check your connection and try again.": "authErr.submitFail",
  "Something went wrong. Please try again.": "code.wrong",
  "Type DELETE to confirm.": "account.typeErr",
  "We couldn’t save. Check your connection and try again.": "account.saveFail",
  "We couldn’t delete the files. Please try again.": "account.deleteFail",
  "We couldn’t delete the account. Please try again.": "account.accountFail",
  "Not sent. Check your connection and try again.": "pay.notSent",
  "Not saved. Check your connection and try again.": "pay.notSaved",
  "Tick the box to approve these amounts.": "pay.tick",
  "Enter the MoMo or Airtel Money number to charge, e.g. 788 123 456.": "pay.badNumber",
  "We couldn’t reach mobile money. Nothing was charged.": "pay.reach",
  "That file is larger than 10 MB. Try a photo instead of a scan, or compress the PDF.": "docs.tooBig",
  "Please upload a PDF, JPG or PNG.": "docs.type",
  "The upload didn’t finish. Check your connection and try again.": "docs.fail",
};

export function trError(locale: Locale, message: string) {
  const key = KNOWN[message];
  return key ? text(locale, key) : message;
}
