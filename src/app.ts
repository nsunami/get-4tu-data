import { PrismaClient } from "@prisma/client"
import type { ItemDetails } from "./types/ItemDetails"
import type { ItemSummary } from "./types/ItemSummary"
import { getInputData } from "./utils/converters"
const db = new PrismaClient()
async function main() {
  const DEFAULT_LIMIT = 999
  const TUE_GROUPS = {
    GENERAL: 28589,
    STUDENTS: 28631,
  }

  console.log(`Preparing to fetch up to ${DEFAULT_LIMIT} items...`)

  const controller = new AbortController()
  const url = `https://data.4tu.nl/v3/datasets?group_ids=${Object.values(
    TUE_GROUPS
  ).toString()}&order=published_date&order_direction=desc&limit=${DEFAULT_LIMIT}`

  console.log(url)

  const items = (await fetch(url, { signal: controller.signal }).then((res) =>
    res.json()
  )) as ItemSummary[]

  if (items.length < DEFAULT_LIMIT) {
    console.log(
      `Found ${items.length} items, which is less than the limit of ${DEFAULT_LIMIT} items. Good to go! 😊`
    )
  } else {
    console.log(
      `Found ${items.length} items, but there is more data than the current limit of ${DEFAULT_LIMIT}. You may miss some items. 😔`
    )
  }

  console.log(
    "For each item, fetching detailed metadata & pushing to the database..."
  )

  const itemsWithoutEmbargoes = items.filter((item) => !item.embargo_title)
  const embargoedItems = items.filter((item) => item.embargo_title)
  console.log(
    `🥷 There are ${embargoedItems.length} embargoed items. Filtering out...`
  )

  const itemsInDatabase = await db.item.findMany({
    where: { doi: { in: itemsWithoutEmbargoes.map((i) => i.doi) as string[] } },
  })

  console.log(
    itemsInDatabase.length,
    "items are already in the database -- skipping them..."
  )

  const newItems = itemsWithoutEmbargoes.filter((item) => {
    const existingDois = itemsInDatabase.map((i) => i.doi)
    return !existingDois.includes(item.doi as string)
  })
  console.log(newItems.length, "new items are found.")

  const createdItems = newItems.map(async (i, index) => {
    process.stdout.write("\r\x1b[K")
    process.stdout.write(
      `Processing Item ${index + 1} / ${newItems.length}: ${i.doi}\n`
    )

    const detailsController = new AbortController()
    const itemDetailsWithId: ItemDetails = await fetch(i.url_public_api, {
      signal: detailsController.signal,
    }).then((res) => res.json())

    const { id, ...itemDetails } = itemDetailsWithId

    const inputData = getInputData(itemDetails)

    return await db.item.create({ data: inputData })
  })

  return (await Promise.all(createdItems)).map((item) => console.log(item?.doi))
}

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
