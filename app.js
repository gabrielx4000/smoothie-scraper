const axios = require('axios')
const cheerio = require('cheerio');

let baseLink = 'https://www.bbcgoodfood.com'

let validLinks = []

let getLinkData = (link) => {
    return axios.get(link).then((response) => {
        return response.data
    })
}

let normalizeString = (string) => {
    return string.trim().replace(/\u00a0/g, " ").replace('\n', ' ')
}

let scrapSmoothieList = () => {
    let urls = [
        'https://www.bbcgoodfood.com/search/recipes/page/2/?q=Smoothie+recipes&sort=-relevance',
        'https://www.bbcgoodfood.com/recipes/collection/smoothie-recipes'
    ]
    
    let getSmoothieData = (url) => {
        return getLinkData(url).then((data) => {
            let $ = cheerio.load(data)
        
            return $('.dynamic-list__list .dynamic-list__list-item').map(function () {
                let url = $(this).find('.card__image-container').attr('href').trim()
                let title = normalizeString($(this).find('h2').text())
                let description = normalizeString($(this).find('p').text())
                let imageURL = $(this).find('.image__img').attr('src').trim()
        
                imageURL = imageURL.substring(0, imageURL.indexOf('?'))
                url = baseLink + url
    
                validLinks.push(url)

                return {
                    title: title,
                    url: url,
                    description: description,
                    thumbnail: imageURL
                }
            })
        })
    }

    return Promise.all(urls.map((url) => {
        return getSmoothieData(url)
    })).then((list) => {
        return list.reduce((preVal, elems) => {
            preVal.push(...elems)
    
            return preVal
        }, [])
    }).then((smoothies) => {
        return smoothies.sort((a, b) => {
            let x = a.id
            let y = b.id

            return ((x < y) ? -1 : ((x > y) ? 1 : 0))
        })
    })
}

let scrapSmoothie = (smoothie) => {
    let scapMainInfo = (data) => {
        let $ = cheerio.load(data)
        
        let postHeader = $('.post-header__body > ul:first > li')

        smoothie.prepTime = normalizeString(postHeader.find(".time-range-list").find("li:first").text()).toLowerCase().replace('prep:', '')
        smoothie.skill = normalizeString(postHeader.find(".post-header__skill-level").text()).toLowerCase()
        smoothie.servings = normalizeString(postHeader.find(".post-header__servings").text()).toLowerCase().replace('serves ', '')

        smoothie.rating = normalizeString($('.rating__values:last').text().replace('A star rating of ', '').split(' ')[0])

        if (smoothie.servings == '') {
            smoothie.servings = '1'
        }

        if (smoothie.rating == '') {
            smoothie.rating = '0'
        }

        smoothie.tags = $('.post-header__body > ul:last > li').map(function() {
            return $(this).text().toLowerCase().trim()
        }).get().reduce((values, elem) => {
            let invalidValues = [
                "share on facebook",
                "share on twitter",
                "share on pinterest",
                "email to a friend"
            ]

            if (!invalidValues.includes(elem)) {
               values.push(elem.replace(' ', '-'))
            }

            return values
        }, [])

        smoothie.nutrition = $('.post-header__body table > tbody .key-value-blocks__key').map(function() {
            let key = normalizeString($(this).text()).toLowerCase()
            let value = normalizeString($(this).parent().find('.key-value-blocks__value').text()).toLowerCase()
            return {
                key: key,
                value: value
            }
        }).get().reduce((preVal, elem) => {
            preVal[elem.key] = elem.value
            
            return preVal
        }, {})

        smoothie.ingredients = $('.recipe__ingredients ul.list li').map(function () {
            return normalizeString($(this).text()).toLowerCase()
        }).get()

        smoothie.steps = $('.recipe__method-steps .grouped-list__list li').map(function () {
            return {
                number: normalizeString($(this).find('span').text()).toLowerCase().replace('step ', ''),
                text: normalizeString($(this).find('p').text())
            }
        }).get()

        smoothie.tips = []
        let tipsDiv =  $('.post__content-end > .col-12').find('.highlight-box__content')
        let hasTips = tipsDiv.length > 0
        if (hasTips) {
            smoothie.tips = tipsDiv.map(function () {
                let title = normalizeString($(this).find('h6').text())
                let text = normalizeString($(this).find('p').text())
                
                if (title == '' || text == '') {
                    let tokens = $(this).text().split('\n')
                    if (title == '') {
                        title = normalizeString(tokens[0])
                    }
                    if (text == '') {
                        text = normalizeString($(this).text().replace(tokens[0] + '\n',''))
                    }
                }
                
                return {
                    title: title,
                    text: text
                }
            }).get()
        }
        
        return smoothie
    }

    let scrapRecommended = (smoothie) => {
        let encodedTitle = encodeURI(smoothie.title)
        let recommendedEndpoint = `https://www.bbcgoodfood.com/api/recipes-frontend/search/recommended-items?limit=8&search=${encodedTitle}&postType=sxs-recipe&useV5=false&category=recipes`
        
        return getLinkData(recommendedEndpoint).then((data) => {
            smoothie.recommended = data.items.map((item) => {
                return {
                    title: normalizeString(item.title),
                    url: baseLink + item.url.trim(),
                    image: item.image.url.substring(0, item.image.url.indexOf('?'))
                }
            })
            
            return smoothie
        })
    }

    return getLinkData(smoothie.url).then((data) => {
        return scapMainInfo(data)
    }).then((recipe) => {
        return scrapRecommended(recipe)
    })
}

scrapSmoothies = () => {
    return scrapSmoothieList().then((smoothieList) => {
        return Promise.all(smoothieList.map((tempSmoothie) => {
            return scrapSmoothie(tempSmoothie)
        }))
    }).then((scrapedSmoothies) => {
        smoothies = scrapedSmoothies.map((smoothie) => {
            smoothie.recommended = smoothie.recommended.reduce((preVal, elem) => {
                if (validLinks.includes(elem.url)) {
                    preVal.push(elem)
                }
    
                return preVal
            }, [])
    
            return smoothie
        })
    
        return smoothies
    })
}

scrapSmoothies().then((smoothies) => {
    const fs = require('fs')
    fs.writeFileSync('smoothies.json', JSON.stringify(smoothies))
})
