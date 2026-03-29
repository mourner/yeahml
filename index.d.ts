export type YamlValue = string | YamlValue[] | {[key: string]: YamlValue} | null;

export function parse(s: string): YamlValue;
