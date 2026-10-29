// DTO de persistencia de uma fatura. O vinculo com o contrato (idContract) e definido
// no caso de uso (que gera as faturas contrato a contrato) e viaja ate o repositorio.
export type InvoiceData = {
	idContract: string,
	date: Date,
	amount: number
};

export default interface InvoiceRepository {
	// Substituicao atomica do periodo/regime: remove as faturas antigas e insere as novas,
	// tudo em uma unica transacao (Unit of Work). Nunca duplica nem deixa pela metade.
	replacePeriod (month: number, year: number, type: string, invoices: InvoiceData[]): Promise<void>;
	// Lista as faturas persistidas de um periodo/regime, ordenadas por date crescente.
	list (month: number, year: number, type: string): Promise<InvoiceData[]>;
}
