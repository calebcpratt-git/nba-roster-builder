// League-data tools for the GM assistant. These are the same lookups the
// /data dashboard's chat panel uses — players, contracts, team cap state, cap
// thresholds, league-cap figures, draft picks, free agents — so both chats
// read the identical generated data and there is one place to keep the tool
// schemas honest.
//
// They return the *scraped* league state, with none of the user's in-builder
// moves applied; the user's own team comes from the rendered cap sheet instead
// (lib/gm-chat/prompt.ts). The system prompt spells that division out.

export { TOOLS, runTool } from '../data-chat-tools'
