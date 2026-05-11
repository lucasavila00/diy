declare module "external-capabilities" {
	export type Capabilities<Allowed> = {
		readonly allowed: Allowed;
		need(id: string): unknown;
	};
}
