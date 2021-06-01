import { JsonRpc } from "eosjs";
import fetch from "node-fetch";

let _rpc: JsonRpc | undefined;
export function getRpc(): JsonRpc {
  if (!_rpc) {
    _rpc = new JsonRpc("https://wax.greymass.com", { fetch });
  }

  return _rpc;
}
