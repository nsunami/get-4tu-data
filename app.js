const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
async function main() {
  const DEFAULT_LIMIT = 999
  const TUE_GROUPS = {
    GENERAL: 28589,
    STUDENTS: 28631,
  }
  console.log(`Preparing to fetch up to ${DEFAULT_LIMIT} items...`)
  const controller = new AbortController()
  const items = await fetch(
    `https://data.4tu.nl/v3/datasets?group_ids=${Object.values(
      TUE_GROUPS
    ).toString()}&order=published_date&order_direction=desc&item_type=3&limit=${DEFAULT_LIMIT}`,
    { signal: controller.signal }
  ).then((res) => res.json())

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

  await items.forEach(async (i) => {
    if (i == null || i.url_public_api == null) return
    const detailsController = new AbortController()
    const { id, ...itemDetails } = await fetch(i.url_public_api, {
      signal: detailsController.signal,
    }).then((res) => res.json())

    const inputData = {
      ...itemDetails,
      authors: {
        create: [...itemDetails.authors].map(removeId),
      },
      categories: {
        create: [...itemDetails.categories].map(removeId),
      },
      files: {
        create: [...itemDetails.files].map(removeId),
      },
      custom_fields: {
        create: [...itemDetails.custom_fields].map(removeId).map((e) => {
          if (Array.isArray(e.value)) return { ...e }
          return { ...e, value: [e.value] }
        }),
      },
      funding_list: {
        create: [...itemDetails.funding_list].map(removeId),
      },
      created_date: new Date(itemDetails.created_date),
      modified_date: new Date(itemDetails.modified_date),
      license: {
        create: itemDetails.license,
      },
      embargo_options: {
        create: itemDetails.embargo_options,
      },
      published_date: new Date(itemDetails.published_date),
      timeline: {
        create: {
          ...itemDetails.timeline,
          posted: new Date(itemDetails.timeline.posted),
          firstOnline: new Date(itemDetails.timeline.firstOnline),
          publisherPublication: new Date(
            itemDetails.timeline.publisherPublication
          ),
        },
      },
      embargo_date: new Date(itemDetails.embargo_date),
    }

    function removeId(e) {
      const { id, ...rest } = e
      return rest
    }
    await db.item.upsert({
      where: { doi: inputData.doi },
      update: {},
      create: inputData,
    })
  })
  console.log("✅Done pushing to the database")
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
