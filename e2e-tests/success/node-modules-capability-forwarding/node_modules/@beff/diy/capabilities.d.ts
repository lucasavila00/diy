export type Capability<Id extends string, Value> = {
	readonly capabilityId: Id;
	readonly value: Value;
};

export type Capabilities<Allowed extends Capability<string, unknown>> = {
	readonly [Entry in Allowed as Entry["capabilityId"]]: Entry["value"];
};
