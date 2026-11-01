/** The field error for a misspelt address: what we think they meant, and one click to use it. */
export function EmailTypoHint({ fix, onUse }) {
  return (
    <>
      Did you mean <span className="break-all font-semibold">{fix}</span>?{' '}
      <button type="button" onClick={() => onUse(fix)} className="font-semibold underline underline-offset-2">
        Use this address
      </button>
    </>
  );
}
