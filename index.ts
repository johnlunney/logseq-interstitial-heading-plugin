import '@logseq/libs';
import SettingSchemaDesc from '@logseq/libs/dist/LSPlugin.user';

const markupChoices = ["markdown", "orgmode"]
const markupHeadMrk = ["#", "*"]
const markupTimeMrk = ["**", "*"]
const settingsTemplate:SettingSchemaDesc[] = [{
    key: "defaultTitle",
    type: 'boolean',
    default: false,
    title: "Insert Header by default?",
    description: "If true, \"<mod> t\" will insert a header, otherwise only the (bold) timestamp.",
   },{
    key: "boldText",
    type: 'boolean',
    default: true,
    title: "Create a bold timestamp? (If not a header)",
    description: "Insert a bold timestamp. Not for header or custom text.",
  },{
    key: "markup",
    type: 'enum',
    enumChoices: markupChoices,
    enumPicker: 'radio',
    default: markupChoices[0],
    title: "What markup language to use?",
    description: "Markdown or Org-mode.",
 },{
    key: "level",
    type: 'number',
    default: 3,
    title: "Title level?",
    description: "Insert timestamped heading level, default to 3 (### HH:MM title)",
 },{
  key: "cstTime",
  type: 'string',
  default: "",
  title: "Custom time stamp?",
  description: "Leave empty for default, \n Use '<time>' as placeholder.\nExample: '[<time>]'",
}
]
logseq.useSettingsSchema(settingsTemplate)

async function updateBlock(block,insertHeader) {

  //prefixB
  let prefix  = markupHeadMrk[markupChoices.indexOf(logseq.settings.markup)].repeat(logseq.settings.level)
  const prefixB = (insertHeader) ? prefix : ""

  //timeB
  const today = new Date();
  const time = today.getHours() + ":" + String(today.getMinutes()).padStart(2, '0')
  //FIX: don't bold if header
  const timePrefix = (insertHeader) ? "" : markupTimeMrk[markupChoices.indexOf(logseq.settings.markup)]
  const timeHolder = (logseq.settings.cstTime) 
      ? logseq.settings.cstTime
      : timePrefix + "<time>" + timePrefix
  const reTime = new RegExp("<time>")
  const timeB = timeHolder.replace(reTime, time)

  //contentB
  prefix = prefix.replace(/\*/g,"\\*") //fix regex
  const re = new RegExp(`^${(prefix === "*" ) ? "\*" : prefix}{1,6}\s+`)
  let contentB = re.test(block.content)
      ? block.content.replace(re, '')
      : block.content;

  // const mdHeader = "#".repeat(logseq.settings.level)

  // const linePrefix = (logseq.settings.markup) 
  //     ? markupHeadMrk[logseq.settings.markup] 
  //     : logseq.settings.cstPrefix


  // const timePrefix = (logseq.settings.markup) ?  markupTimeMrk[logseq.settings.markup] : false
  // let timestamp = (logseq.settings.defaultTitle) ? " <time> " : timePrefix + "<time>" + timePrefix + " "
  // const re2 = 
  
  // let prefix = simple ? linePrefix.repeat(logseq.settings.level) : ''

  await logseq.Editor.updateBlock(
          block.uuid,
          `${prefixB} ${timeB} ${contentB} `
          );
}

async function insertInterstitional(simple) {
  const selected = await logseq.Editor.getSelectedBlocks();
  if (selected && selected.length > 1) {
    for (let block of selected) {
        updateBlock(block, simple)
         }
  } else {
    const block = await logseq.Editor.getCurrentBlock();
    if (block?.uuid) {
        updateBlock(block, simple)
    }
  }
}

function journalDate() {
  //hardcoded yesterday
  let date = (function(d){ d.setDate(d.getDate()-1); return d})(new Date)
  return parseInt(`${date.getFullYear()}${("0" + (date.getMonth()+1)).slice(-2)}${("0" + date.getDate()).slice(-2)}`,10)
}

async function parseQuery(randomQuery,queryTag){
  // https://stackoverflow.com/questions/19156148/i-want-to-remove-double-quotes-from-a-string
  let query = `[:find (pull ?b [*])
  :where
  [?b :block/path-refs [:block/name "${queryTag.toLowerCase().trim().replace(/^["'](.+(?=["']$))["']$/, '$1')}"]]]`
  if ( randomQuery == "yesterday" ) {
    query = `[:find (pull ?b [*])
    :where
    [?b :block/path-refs [:block/name "${queryTag.toLowerCase().trim().replace(/^["'](.+(?=["']$))["']$/, '$1')}"]]
    [?b :block/page ?p]
    [?p :block/journal? true]
    [?p :block/journal-day ${journalDate()}]]`
  }
  try { 
    let results = await logseq.DB.datascriptQuery(query) 
    //Let this be, it won't hurt even if there's only one hit
    let flattenedResults = results.map((mappedQuery) => ({
      uuid: mappedQuery[0].uuid['$uuid$'],
    }))
    let index = Math.floor(Math.random()*flattenedResults.length)
    const origBlock = await logseq.Editor.getBlock(flattenedResults[index].uuid, {
      includeChildren: true,
    });
    // return `((${flattenedResults[index].uuid}))`
    return flattenedResults[index].uuid
  } catch (error) {return false}
}

async function onTemplate(uuid){
  //is block(uuid) on a template?
  //returns boolean
  try {
    const block = await logseq.Editor.getBlock(uuid, {includeChildren: false})
    const checkTPL = (block.properties && block.properties.template != undefined) ? true : false
    const checkPRT = (block.parent != null && block.parent.id !== block.page.id)  ? true : false

    if (checkTPL === false && checkPRT === false) return false
    if (checkTPL === true )                       return true 
    return await onTemplate(block.parent.id) 

  } catch (error) { console.log(error) }
}

const main = async () => {

  logseq.Editor.registerSlashCommand('Interstitial: Create Random Quote', async () => {
    await logseq.Editor.insertAtEditingCursor(`{{renderer :interstitial, random, quote}} `);
  });

  logseq.Editor.registerSlashCommand('Interstitial: Create Note to Self', async () => {
    await logseq.Editor.insertAtEditingCursor(`{{renderer :interstitial, yesterday, ntnds}} `);
  });

  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    try {
      var [type, randomQ , tagQ ] = payload.arguments
      if (type !== ':interstitial') return

      //is the block on a template?
      const templYN = await onTemplate(payload.uuid)        
      const uuid = await parseQuery( randomQ, tagQ)
      // parseQuery returns false if no uuid can be found
      const msg = uuid ? `<span style="color: green">{{renderer ${payload.arguments} }}</span> (will run with template)` : `<span style="color: red">{{renderer ${payload.arguments} }}</span> (wrong tag?)`

      if (templYN === true || uuid === false) { 
          await logseq.provideUI({
          key: "interstitial",
          slot,
          template: `${msg}`,
          reset: true,
          style: { flex: 1 },
        })
        return 
      }
      else { 
        const nblock = await logseq.Editor.getBlock(uuid);
        if (!nblock.properties?.id) { logseq.Editor.upsertBlockProperty(nblock.uuid, "id", nblock.uuid); }
        await logseq.Editor.updateBlock(payload.uuid, `((${uuid}))`) 
      }  
    } catch (error) { console.log(error) }
  })

    logseq.App.registerCommandPalette(
      {
        key: `interstial-time-stamp`,
        label: `Insert interstitial line`,
        keybinding: {
          mode: 'global',
          binding: 'mod+t',
        },
      },
      async () => {
        await insertInterstitional(logseq.settings.defaultTitle ? true : false);
      }
    );

    logseq.App.registerCommandPalette(
      {
        key: `interstial-time-stamp-h`,
        label: `Insert interstitial heading`,
        keybinding: {
          mode: 'global',
          binding: 'mod+shift+t',
        },
      },
      async () => {
        await insertInterstitional(logseq.settings.defaultTitle ? false : true);
      }
    );
}

logseq.ready(main).catch(console.error);
