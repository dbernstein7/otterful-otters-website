/** Otterful Otters ERC-721 on ApeChain */
export const OTTER_CONTRACT = '0x4e5913922b7ddf916c8d27d1016827f799687e66';
export const OTTER_MAX_ID = 2222;
export const WALLET_TRAITS_KEY = 'ottvatar_wallet_traits_v1';
export const EMBED_SELECTION_KEY = 'ottvatar_embed_selection_v1';

export const apeChain = {
  id: 33139,
  name: 'ApeChain',
  nativeCurrency: { name: 'ApeCoin', symbol: 'APE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.apechain.com/http'] },
  },
  blockExplorers: {
    default: { name: 'Apescan', url: 'https://apescan.io' },
  },
};

export const APECHAIN_SWITCH = {
  chainId: '0x8173',
  chainName: 'ApeChain',
  nativeCurrency: { name: 'ApeCoin', symbol: 'APE', decimals: 18 },
  rpcUrls: ['https://rpc.apechain.com/http'],
  blockExplorerUrls: ['https://apescan.io'],
};
