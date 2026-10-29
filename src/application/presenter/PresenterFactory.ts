import Presenter from "./Presenter";

// Porta da Dynamic Factory de presenters.
// Resolve um Presenter a partir do campo opcional `format` do Input.
// Convencao: ausencia de format => JSON; "json" => JSON; "csv" => CSV; qualquer outro => Error("Invalid format").
export default interface PresenterFactory {
	create (format?: string): Presenter;
}
