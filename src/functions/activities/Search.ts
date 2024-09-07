import { Page } from 'playwright'
import { platform } from 'os'
import { Workers } from '../Workers'
import { Counters, DashboardData } from '../../interface/DashboardData'
import axios from 'axios'

export class Search extends Workers {
    private bingHome = 'https://cn.bing.com'
    private searchPageURL = ''

    public async doSearch(page: Page, data: DashboardData) {
        this.bot.log('SEARCH-BING', 'Starting Bing searches')

        page = await this.bot.browser.utils.getLatestTab(page)

        let searchCounters: Counters = await this.bot.browser.func.getSearchPoints()
        let missingPoints = this.calculatePoints(searchCounters)

        if (missingPoints === 0) {
            this.bot.log('SEARCH-BING', `Bing searches for ${this.bot.isMobile ? 'MOBILE' : 'DESKTOP'} have already been completed`)
            return
        }

        // Generate search queries
        let queries = await this.getTrends(data.userProfile.attributes.country)
        queries = this.bot.utils.shuffleArray(queries)

        // Deduplicate the search terms
        queries = [...new Set(queries)]

        // Go to bing
        await page.goto(this.searchPageURL ? this.searchPageURL : this.bingHome)

        let maxLoop = 0 // If the loop hits 10 this when not gaining any points, we're assuming it's stuck. If it ddoesn't continue after 5 more searches with alternative queries, abort search

        await this.bot.browser.utils.tryDismissBingCookieBanner(page)

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
                const query = queries[i++]

                if (!query) return

                // Get related search terms to the Google search queries
                const relatedTerms = await this.getRelatedTerms(query)
                if (relatedTerms.length > 3) {
                    // Search for the first 2 related terms
                    for (const term of relatedTerms.slice(1, 3)) {
                        this.bot.log('SEARCH-BING-EXTRA', `${missingPoints} Points Remaining | Query: ${term} | Mobile: ${this.bot.isMobile}`)

                        searchCounters = await this.bingSearch(page, term)
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
                // This page had already been set to the Bing.com page or the previous search listing, we just need to select it
                searchPage = await this.bot.browser.utils.getLatestTab(searchPage)
                // Go to top of the page
                await searchPage.evaluate(() => {
                    window.scrollTo(0, 0)
                })

                // Set it since params get added after visiting
                this.searchPageURL = searchPage.url()
                this.bot.log('SEARCH-BING', `Search page url: ${this.searchPageURL}`)
                await this.bot.utils.wait(500)

                const searchBar = '#sb_form_q'
                await searchPage.waitForSelector(searchBar, { state: 'attached', timeout: 10_000 })
                await searchPage.click(searchBar) // Focus on the textarea
                await this.bot.utils.wait(500)
                await searchPage.keyboard.down(platformControlKey)
                await searchPage.keyboard.press('A')
                await searchPage.keyboard.press('Backspace')
                await searchPage.keyboard.up(platformControlKey)
                await searchPage.keyboard.type(query)
                await searchPage.keyboard.press('Enter')

                await this.bot.utils.wait(1000)

                // Bing.com in Chrome opens a new tab when searching
                const resultPage = await this.bot.browser.utils.getLatestTab(searchPage)
                this.searchPageURL = new URL(resultPage.url()).href // Set the results page

                if (this.bot.config.searchSettings.scrollRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.randomScroll(resultPage)
                }

                if (this.bot.config.searchSettings.clickRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.clickRandomLink(resultPage)
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
                await this.closeTabs(lastTab)

                await this.bot.utils.wait(4000)
            }
        }

        this.bot.log('SEARCH-BING', 'Search failed after 5 retries, ending', 'error')
        return await this.bot.browser.func.getSearchPoints()
    }

    private async getTrends(geoLocale: string) {
        const queryTerms: string[] = []
        const keywordSource = ['toutiaohot', 'baiduhot', 'zhihuhot', 'douyinhot']
        geoLocale = (this.bot.config.searchSettings.useGeoLocaleQueries && geoLocale.length === 2) ? geoLocale.toUpperCase() : 'UNKONWN'

        this.bot.log('SEARCH-TRENDS', `Generating search queries, can take a while! | GeoLocale: ${geoLocale}`)

        for (const keyword of keywordSource) {
            try {
                const url = `https://tenapi.cn/v2/${keyword}`
                const request = {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }

                const response = await axios(url, request)
          
                return response.data
                    .data
                    .map((item: { name: string }) => item.name) as string[]
            } catch (error) {
                this.bot.log('SEARCH-TRENDS', 'An error occurred:' + error, 'error')
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

            const response = await axios(url, request)

            return response.data[1] as string[]
        } catch (error) {
            this.bot.log('SEARCH-BING-RELTATED', 'An error occurred:' + error, 'error')
        }
        return []
    }

    private async randomScroll(page: Page) {
        try {
            const viewportHeight = await page.evaluate(() => window.innerHeight)
            const totalHeight = await page.evaluate(() => document.body.scrollHeight)
            const randomScrollPosition = Math.floor(Math.random() * (totalHeight - viewportHeight))

            await page.evaluate((scrollPos) => {
                window.scrollTo(0, scrollPos)
            }, randomScrollPosition)

        } catch (error) {
            this.bot.log('SEARCH-RANDOM-SCROLL', 'An error occurred:' + error, 'error')
        }
    }

    private async clickRandomLink(page: Page) {
        try {
            await page.click('#b_results .b_algo h2', { timeout: 2000 }).catch(() => { }) // Since we don't really care if it did it or not

            // 不知道什么原因，有时候点击后，getLatestTab 获取到的不是刚刚点击跳转后的新页面，需要加延迟
            await this.bot.utils.wait(2_000) 
            // Will get current tab if no new one is created, this will always be the visited site or the result page if it failed to click
            let lastTab = await this.bot.browser.utils.getLatestTab(page)

            // Stay for 10 seconds
            await this.bot.utils.wait(10_000)

            let lastTabURL = new URL(lastTab.url()) // Get new tab info, this is the website we've visited
            // Check if the URL is different from the original one, don't loop more than 5 times.
            let i = 0
            while (lastTabURL.href !== this.searchPageURL && i < 5) {

                await this.closeTabs(lastTab)

                // End of loop, refresh lastPage
                lastTab = await this.bot.browser.utils.getLatestTab(page) // Finally update the lastTab var again
                lastTabURL = new URL(lastTab.url()) // Get new tab info
                i++
            }
        } catch (error) {
            this.bot.log('SEARCH-RANDOM-CLICK', 'An error occurred:' + error, 'error')
        }
    }

    private async closeTabs(lastTab: Page) {
        const browser = lastTab.context()
        const tabs = browser.pages()

        // If more than 2 tabs are open, close the last tab
        if (tabs.length > 2) {
            await lastTab.close()

            // If only 1 tab is open, open a new one to search in
        } else if (tabs.length === 1) {
            const newPage = await browser.newPage()
            await this.bot.utils.wait(1000)
            await newPage.goto(this.bingHome)
            await this.bot.utils.wait(3000)
            this.searchPageURL = newPage.url()

            // Else reset the last tab back to the search listing
        } else {
            lastTab = await this.bot.browser.utils.getLatestTab(lastTab)
            await lastTab.goto(this.searchPageURL)
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
