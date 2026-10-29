// Porta de apresentação genérica: serve a qualquer caso de uso.
// Recebe a lista de faturas no DTO { date, amount } e devolve a representação final.
export type InvoiceDTO = {
	date: Date,
	amount: number
};

export default interface Presenter {
	present (output: InvoiceDTO[]): any;
}
