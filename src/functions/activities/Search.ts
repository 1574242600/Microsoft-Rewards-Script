import { Page } from 'playwright'
import { platform } from 'os'

import { Workers } from '../Workers'

import { Counters, DashboardData } from '../../interface/DashboardData'
import { GoogleTrends } from '../../interface/GoogleDailyTrends'
import { GoogleSearch } from '../../interface/Search'


export class Search extends Workers {

    private searchPageURL = 'https://bing.com'

    public async doSearch(page: Page, data: DashboardData) {
        this.bot.log('SEARCH-BING', 'Starting bing searches')

        page = await this.bot.browser.utils.getLatestTab(page)

        let searchCounters: Counters = await this.bot.browser.func.getSearchPoints()
        let missingPoints = this.calculatePoints(searchCounters)

        if (missingPoints === 0) {
            this.bot.log('SEARCH-BING', `Bing searches for ${this.bot.isMobile ? 'MOBILE' : 'DESKTOP'} have already been completed`)
            return
        }

        // Generate search queries
        // let googleSearchQueries = await this.getGoogleTrends(data.userProfile.attributes.country, missingPoints)
        // googleSearchQueries = this.bot.utils.shuffleArray(googleSearchQueries)

        // // Deduplicate the search terms
        // googleSearchQueries = [...new Set(googleSearchQueries)]

        // // Go to bing
        // await page.goto(this.searchPageURL)

        // const queries: string[] = []
        // // Mobile search doesn't seem to like related queries?
        // googleSearchQueries.forEach(x => { this.bot.isMobile ? queries.push(x.topic) : queries.push(x.topic, ...x.related) })

        const queries = ["盛年不重来，一日难再晨", "千里之行，始于足下", "少年易学老难成，一寸光阴不可轻", "敏而好学，不耻下问", "海内存知已，天涯若比邻","三人行，必有我师焉",
    "莫愁前路无知已，天下谁人不识君", "人生贵相知，何用金与钱", "天生我材必有用", "海纳百川有容乃大；壁立千仞无欲则刚", "穷则独善其身，达则兼济天下", "读书破万卷，下笔如有神",
    "学而不思则罔，思而不学则殆", "一年之计在于春，一日之计在于晨", "莫等闲，白了少年头，空悲切", "少壮不努力，老大徒伤悲", "一寸光阴一寸金，寸金难买寸光阴","近朱者赤，近墨者黑",
    "吾生也有涯，而知也无涯", "纸上得来终觉浅，绝知此事要躬行", "学无止境", "己所不欲，勿施于人", "天将降大任于斯人也", "鞠躬尽瘁，死而后已", "书到用时方恨少","天下兴亡，匹夫有责",
    "人无远虑，必有近忧","为中华之崛起而读书","一日无书，百事荒废","岂能尽如人意，但求无愧我心","人生自古谁无死，留取丹心照汗青","吾生也有涯，而知也无涯","生于忧患，死于安乐",
    "言必信，行必果","读书破万卷，下笔如有神","夫君子之行，静以修身，俭以养德","老骥伏枥，志在千里","一日不读书，胸臆无佳想","王侯将相宁有种乎","淡泊以明志。宁静而致远,","卧龙跃马终黄土"]

        let maxLoop = 0 // If the loop hits 10 this when not gaining any points, we're assuming it's stuck. If it ddoesn't continue after 5 more searches with alternative queries, abort search
        // Loop over Google search queries
        for (let i = 0; i < queries.length; i++) {
            const query = queries[i] as string

            this.bot.log('SEARCH-BING', `${missingPoints} Points Remaining | Query: ${query} | Mobile: ${this.bot.isMobile}`)

            searchCounters = await this.bingSearch(page, query)
            const newMissingPoints = this.calculatePoints(searchCounters)

            // If the new point amount is the same as before
            if (newMissingPoints == missingPoints) {
                maxLoop++ // Add to max loop
            } else { // There has been a change in points
                maxLoop = 0 // Reset the loop
            }

            missingPoints = newMissingPoints

            if (missingPoints === 0) {
                break
            }

            // Only for mobile searches
            if (maxLoop > 3 && this.bot.isMobile) {
                this.bot.log('SEARCH-BING-MOBILE', 'Search didn\'t gain point for 3 iterations, likely bad User-Agent', 'warn')
                break
            }

            // If we didn't gain points for 10 iterations, assume it's stuck
            if (maxLoop > 10) {
                this.bot.log('SEARCH-BING', 'Search didn\'t gain point for 10 iterations aborting searches', 'warn')
                maxLoop = 0 // Reset to 0 so we can retry with related searches below
                break
            }
        }

        // Only for mobile searches
        if (missingPoints > 0 && this.bot.isMobile) {
            return
        }

        // If we still got remaining search queries, generate extra ones
        if (missingPoints > 0) {
            this.bot.log('SEARCH-BING', `Search completed but we're missing ${missingPoints} points, generating extra searches`)

            let i = 0
            while (missingPoints > 0) {
                const query = googleSearchQueries[i++] as GoogleSearch

                // Get related search terms to the Google search queries
                const relatedTerms = await this.getRelatedTerms(query?.topic)
                if (relatedTerms.length > 3) {
                    // Search for the first 2 related terms
                    for (const term of relatedTerms.slice(1, 3)) {
                        this.bot.log('SEARCH-BING-EXTRA', `${missingPoints} Points Remaining | Query: ${term} | Mobile: ${this.bot.isMobile}`)

                        searchCounters = await this.bingSearch(page, query.topic)
                        const newMissingPoints = this.calculatePoints(searchCounters)

                        // If the new point amount is the same as before
                        if (newMissingPoints == missingPoints) {
                            maxLoop++ // Add to max loop
                        } else { // There has been a change in points
                            maxLoop = 0 // Reset the loop
                        }

                        missingPoints = newMissingPoints

                        // If we satisfied the searches
                        if (missingPoints === 0) {
                            break
                        }

                        // Try 5 more times, then we tried a total of 15 times, fair to say it's stuck
                        if (maxLoop > 5) {
                            this.bot.log('SEARCH-BING-EXTRA', 'Search didn\'t gain point for 5 iterations aborting searches', 'warn')
                            return
                        }
                    }
                }
            }
        }

        this.bot.log('SEARCH-BING', 'Completed searches')
    }

    private async bingSearch(searchPage: Page, query: string) {
        const platformControlKey = platform() === 'darwin' ? 'Meta' : 'Control'

        // Try a max of 5 times
        for (let i = 0; i < 5; i++) {
            try {

                // Go to top of the page
                await searchPage.evaluate(() => {
                    window.scrollTo(0, 0)
                })

                await this.bot.utils.wait(500)

                const searchBar = '#sb_form_q'
                await searchPage.waitForSelector(searchBar, { state: 'visible', timeout: 10_000 })
                await searchPage.click(searchBar) // Focus on the textarea
                await this.bot.utils.wait(500)
                await searchPage.keyboard.down(platformControlKey)
                await searchPage.keyboard.press('A')
                await searchPage.keyboard.press('Backspace')
                await searchPage.keyboard.up(platformControlKey)
                await searchPage.keyboard.type(query)
                await searchPage.keyboard.press('Enter')

                if (this.bot.config.searchSettings.scrollRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.randomScroll(searchPage)
                }

                if (this.bot.config.searchSettings.clickRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.clickRandomLink(searchPage)
                }

                // Delay between searches
                await this.bot.utils.wait(Math.floor(this.bot.utils.randomNumber(this.bot.config.searchSettings.searchDelay.min, this.bot.config.searchSettings.searchDelay.max)))

                return await this.bot.browser.func.getSearchPoints()

            } catch (error) {
                if (i === 5) {
                    this.bot.log('SEARCH-BING', 'Failed after 5 retries... An error occurred:' + error, 'error')
                    break

                }
                this.bot.log('SEARCH-BING', 'Search failed, An error occurred:' + error, 'error')
                this.bot.log('SEARCH-BING', `Retrying search, attempt ${i}/5`, 'warn')

                // Reset the tabs
                const lastTab = await this.bot.browser.utils.getLatestTab(searchPage)
                await this.closeTabs(lastTab, this.searchPageURL)

                await this.bot.utils.wait(4000)
            }
        }

        this.bot.log('SEARCH-BING', 'Search failed after 5 retries, ending', 'error')
        return await this.bot.browser.func.getSearchPoints()
    }

    private async getGoogleTrends(geoLocale: string, queryCount: number): Promise<GoogleSearch[]> {
        const queryTerms: GoogleSearch[] = []
        let i = 0

        geoLocale = (this.bot.config.searchSettings.useGeoLocaleQueries && geoLocale.length === 2) ? geoLocale.toUpperCase() : 'US'

        this.bot.log('SEARCH-GOOGLE-TRENDS', `Generating search queries, can take a while! | GeoLocale: ${geoLocale}`)

        while (queryCount > queryTerms.length) {
            i += 1
            const date = new Date()
            date.setDate(date.getDate() - i)
            const formattedDate = this.formatDate(date)

            try {
                const url = `https://trends.google.com/trends/api/dailytrends?geo=${geoLocale}&hl=en&ed=${formattedDate}&ns=15`
                const request = {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }

                const response = await fetch(url, request)

                const data: GoogleTrends = (await response.json()).slice(5)

                for (const topic of data.default.trendingSearchesDays[0]?.trendingSearches ?? []) {
                    queryTerms.push({
                        topic: topic.title.query.toLowerCase(),
                        related: topic.relatedQueries.map(x => x.query.toLowerCase())
                    })
                }

            } catch (error) {
                this.bot.log('SEARCH-GOOGLE-TRENDS', 'An error occurred:' + error, 'error')
            }
        }

        return queryTerms
    }

    private async getRelatedTerms(term: string): Promise<string[]> {
        try {
            const url = `https://api.bing.com/osjson.aspx?query=${term}`

            const request = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await fetch(url, request)

            return (await response.json()).data[1] as string[]
        } catch (error) {
            this.bot.log('SEARCH-BING-RELTATED', 'An error occurred:' + error, 'error')
        }
        return []
    }

    private formatDate(date: Date): string {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')

        return `${year}${month}${day}`
    }

    private async randomScroll(page: Page) {
        try {
            const scrollAmount = this.bot.utils.randomNumber(5, 5000)

            await page.evaluate((scrollAmount) => {
                window.scrollBy(0, scrollAmount)
            }, scrollAmount)

        } catch (error) {
            this.bot.log('SEARCH-RANDOM-SCROLL', 'An error occurred:' + error, 'error')
        }
    }

    private async clickRandomLink(page: Page) {
        try {
            const searchListingURL = new URL(page.url()) // Get searchPage info before clicking

            await page.click('#b_results .b_algo h2').catch(() => { }) // Since we don't really care if it did it or not

            // Will get current tab if no new one is created
            let lastTab = await this.bot.browser.utils.getLatestTab(page)

            // Let website load, if it doesn't load within 5 sec. exit regardless
            await this.bot.utils.wait(5000)

            let lastTabURL = new URL(lastTab.url()) // Get new tab info

            // Check if the URL is different from the original one, don't loop more than 5 times.
            let i = 0
            while (lastTabURL.href !== searchListingURL.href && i < 5) {

                await this.closeTabs(lastTab, searchListingURL.href)

                // End of loop, refresh lastPage
                lastTab = await this.bot.browser.utils.getLatestTab(page) // Finally update the lastTab var again
                lastTabURL = new URL(lastTab.url()) // Get new tab info
                i++
            }

        } catch (error) {
            this.bot.log('SEARCH-RANDOM-CLICK', 'An error occurred:' + error, 'error')
        }
    }

    private async closeTabs(lastTab: Page, url: string) {
        const browser = lastTab.context()
        const tabs = browser.pages()

        // If more than 3 tabs are open, close the last tab
        if (tabs.length > 2) {
            await lastTab.close()

            // If only 1 tab is open, open a new one to search in
        } else if (tabs.length === 1) {
            const newPage = await browser.newPage()
            await newPage.goto(url)

            // Else go back one page
        } else {
            await lastTab.goBack()
        }
    }


    private calculatePoints(counters: Counters) {
        const mobileData = counters.mobileSearch?.[0] // Mobile searches
        const genericData = counters.pcSearch?.[0] // Normal searches
        const edgeData = counters.pcSearch?.[1] // Edge searches

        const missingPoints = (this.bot.isMobile && mobileData)
            ? mobileData.pointProgressMax - mobileData.pointProgress
            : (edgeData ? edgeData.pointProgressMax - edgeData.pointProgress : 0)
            + (genericData ? genericData.pointProgressMax - genericData.pointProgress : 0)

        return missingPoints
    }
}