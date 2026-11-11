export type MonthInterval = {
  month: string;
  start: Date;
  end: Date;
};

/** Parse a YYYY-MM month and return its UTC half-open interval. */
export function monthInterval(month: string): MonthInterval {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error("Month must be in YYYY-MM format.");

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1000 || year > 9998) throw new Error("Month is outside the supported range.");

  return {
    month,
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}
