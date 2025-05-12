import React, { useState, JSX } from 'react';
import styles from '../styles/MealCard.module.css';

interface Meal {
  meal: string;
  ingredients: string[];
  link: string;
  imageUrl?: string;
  description: string;
}

export default function Home() {
  const [mealPlan, setMealPlan] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | JSX.Element | null>(null);
  const [numMeals, setNumMeals] = useState<number>(3);
  const [userPreferences, setUserPreferences] = useState<string>('');
  const [groceryList, setGroceryList] = useState<{ [key: string]: string[] }>({});
  const [replacingMealIndices, setReplacingMealIndices] = useState<number[]>([]);
  const [generatingGroceryList, setGeneratingGroceryList] = useState(false);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);

  const handleFlipCard = (index: number, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent any parent handlers from firing
    setFlippedCards(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  async function generateImageForMeal(mealName: string, retries = 3): Promise<string> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: wait longer between each retry
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }

        const response = await fetch('/api/generate-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mealName }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 429 && attempt < retries - 1) {
            console.log(`Rate limited on attempt ${attempt + 1}, retrying...`);
            continue;
          }
          throw new Error(errorData.error || 'Failed to generate image');
        }

        const data = await response.json();
        return data.imageUrl;
      } catch (error) {
        console.error(`Error generating image on attempt ${attempt + 1}:`, error);
        if (attempt === retries - 1) {
          return ''; // Return empty string after all retries fail
        }
      }
    }
    return ''; // Return empty string if all retries fail
  }

  async function fetchMealPlan() {
    setLoading(true);
    setError(null);
    try {
      let prompt = `Generate a list of ${numMeals} distinct and interesting dinner recipes`;
      if (userPreferences) {
        prompt += ` that are ${userPreferences}`;
      }
      prompt += ` along with a list of ingredients and a link to the recipe. Ensure that no recipes are repeated in this list. Format this as a JSON array of objects, where each object has three keys: "meal" (the name of the meal as a string), "ingredients" (an array of strings, where each string is an ingredient in the recipe), and "link" (a string, the link to the recipe).`;
  
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error || 'Failed to generate meal plan.');
      }
  
      const meals = await response.json() as Meal[];
      
      if (!Array.isArray(meals) || meals.length === 0) {
        throw new Error('Invalid meal plan response format');
      }
      
      // Generate images for each meal with a slight delay between requests
      const mealsWithImages = await Promise.all(
        meals.map(async (meal, index) => {
          // Add a small delay between image requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, index * 2000));
          const imageUrl = await generateImageForMeal(meal.meal);
          return { ...meal, imageUrl };
        })
      );
      
      setMealPlan(mealsWithImages);
    } catch (err: any) {
      console.error('Failed to fetch meal plan:', err);
      const errorMessage = err.message || 'Failed to generate meal plan. Please try again.';
      setError(
        <div className={styles.errorMessage}>
          <p>{errorMessage}</p>
          <button 
            onClick={() => setError(null)} 
            className={styles.dismissError}
          >
            Dismiss
          </button>
        </div>
      );
    } finally {
      setLoading(false);
    }
  }

  async function generateGroceryList() {
    setGeneratingGroceryList(true); // Set loading state for grocery list
    setError(null);
    try {
      const allIngredients: string[] = [];
      mealPlan.forEach((meal) => {
        allIngredients.push(...meal.ingredients);
      });

      const prompt = `Take the following list of ingredients: ${allIngredients.join(', ')}. Aggregate ingredients of the same type and group them by common grocery store sections such as "Produce", "Dairy", "Meat & Seafood", "Pantry", "Spices & Seasonings", "Frozen", etc. Return the grocery list as a JSON object where the keys are the section names and the values are arrays of the ingredients in that section, including estimated quantities if possible (e.g., "2 lemons", "1 dozen eggs").`;

      const response = await fetch('/api/grocery-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error || 'Failed to generate categorized grocery list.');
      }

      const data = await response.json();
      setGroceryList(data);
    } catch (err: any) {
      console.error('Failed to generate categorized grocery list:', err);
      setError(err.message || 'Failed to generate categorized grocery list. Please try again.');
    } finally {
      setGeneratingGroceryList(false); // Reset loading state
    }
  }

  async function handleDiscardMeal(indexToDiscard: number) {
    setReplacingMealIndices((prevIndices) => [...prevIndices, indexToDiscard]);
    setError(null);
    try {
      let replacementPrompt = `Generate one interesting dinner recipe`;
      if (userPreferences) {
        replacementPrompt += ` that is ${userPreferences}`;
      }
      replacementPrompt += ` Include a list of ingredients and a link to the recipe. Format this as a JSON array of one object with the keys: "meal" (string), "ingredients" (array of strings), and "link" (string).`;
  
      const response = await fetch('/api/replace-meal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: replacementPrompt }),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error || 'Failed to replace meal.');
      }
  
      const newMeal = await response.json() as Meal;
      setMealPlan((prevMealPlan) => {
        const updatedMealPlan = [...prevMealPlan];
        updatedMealPlan[indexToDiscard] = newMeal;
        return updatedMealPlan;
      });
    } catch (err: any) {
      console.error('Failed to replace meal:', err);
      setError(err.message || 'Failed to replace meal. Please try again.');
    } finally {
      setReplacingMealIndices((prevIndices) => prevIndices.filter((index) => index !== indexToDiscard));
    }
  }

  return (
    <div className={styles.container}>
      <h1>Your Meal Plan:</h1>
      <div className={styles.controls}>
        <label htmlFor="numMeals">Number of Meals:</label>
        <input
          type="number"
          id="numMeals"
          value={numMeals}
          onChange={(e) => setNumMeals(parseInt(e.target.value))}
          min="1"
          max="7"
        />
      </div>
      <div className={styles.controls}>
        <label htmlFor="userPreferences">Preferences (e.g., kid-friendly, vegetarian, quick):</label>
        <input
          type="text"
          id="userPreferences"
          value={userPreferences}
          onChange={(e) => setUserPreferences(e.target.value)}
          placeholder="Enter your preferences here"
        />
      </div>
      <button onClick={fetchMealPlan}>Generate Meal Plan</button>

      {loading ? (
        <div className={styles.loadingMessage}>
          <p>Generating meal plan - this may take up to 2 minutes...</p>
          <p className={styles.loadingSubtext}>Using AI to create unique recipes and fantasy-style images</p>
        </div>
      ) : error ? (
        <p style={{ color: 'red' }}>{error}</p>
      ) : mealPlan.length > 0 ? (
        <div className={styles['meal-grid']}>
          {mealPlan.map((meal, index) => (
            <div key={index} className={styles['meal-card']}>
              {replacingMealIndices.includes(index) ? (
                <div className={styles['loading-card']}>
                  <p>Replacing meal - this may take a minute...</p>
                </div>
              ) : (
                <>
                  <div 
                    className={`${styles['card-inner']} ${flippedCards.includes(index) ? styles.flipped : ''}`}
                    onClick={(e) => handleFlipCard(index, e)}
                  >
                    <div className={styles['card-front']}>
                      <h2>{meal.meal}</h2>
                      <div 
                        className={styles['meal-description']}
                        style={meal.imageUrl ? {
                          backgroundImage: `url(${meal.imageUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        } : undefined}
                      >
                        {!meal.imageUrl && <p>A delicious suggestion for your week!</p>}
                      </div>
                      <div className={styles['card-text-box']}>
                        <p className={styles.fantasyDescription}>{meal.description || 'Ready to explore this recipe? Flip to see the ingredients, or click "Discard this meal" for a new one.'}</p>
                      </div>
                      <div className={styles['card-actions']}>
                        <button>View Ingredients</button>
                      </div>
                    </div>
                    <div className={styles['card-back']}>
                      <h2>{meal.meal}</h2>
                      <div className={styles['card-text-box']}>
                        <h4>Ingredients:</h4>
                        <ul>
                          {meal.ingredients.map((ingredient, i) => (
                            <li key={i}>{ingredient}</li>
                          ))}
                        </ul>
                      </div>
                      <div className={styles['card-actions']}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFlipCard(index, e);
                          }}
                        >
                          Flip Card
                        </button>
                        <a 
                          href={meal.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Link to Recipe
                        </a>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDiscardMeal(index);
                    }}
                    className={styles['discard-button']}
                  >
                    Discard this meal
                  </button>
                </>
              )}
            </div>
          ))}
          <div className={styles['grocery-list-controls']}>
            {generatingGroceryList ? (
              <p>Organizing your magical ingredients list...</p>
            ) : (
              <button onClick={generateGroceryList}>Generate Grocery List</button>
            )}
          </div>
        </div>
      ) : (
        <p>No meal plan generated yet.</p>
      )}

      {groceryList && Object.keys(groceryList).length > 0 && (
        <div className={styles['grocery-scroll']}>
          <h2>Grocery List:</h2>
          {Object.entries(groceryList).map(([section, items]) => (
            <div key={section}>
              <h3>{section}</h3>
              <ul>
                {items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
          <button onClick={() => navigator.clipboard.writeText(Object.values(groceryList).flat().join('\n'))}>
            Copy to Clipboard
          </button>
        </div>
      )}
    </div>
  );
}