import os
import psycopg2
import psycopg2.extras

DATABASE_URL = 'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'

quests = [
    # 1 Star Quests (*)
    ('High five 5 strangers', 'High five 5 strangers passing by in the yard', 1),
    ('Compliment 3 outfits', 'Compliment 3 outfits dramatically', 1),
    ('Cabot Library Photo', 'Walk into Cabot library and take a photo with what you think is the most stressed looking person', 1),
    ('Slow motion walk', 'Do a slow motion walk through science center plaza', 1),
    ('Smith Center Motivation', 'Find a group studying in the Smith Center and ask them what keeps them motivated to grind', 1),
    ('Bunny Ranking', 'Take photos of 5 bunnies on campus and rank them', 1),
    ('Lamont Pickup Line', 'Try a cringy pick up line on someone in Lamont cafe', 1),
    ('Librarian Favorite', 'Ask a librarian what their fav book is and find it', 1),

    # 2 Star Quests (**)
    ('Fake Harvard Tradition', 'Convince a tourist of a fake Harvard tradition; invent a fake ritual and have tourists participate', 2),
    ('Dramatic Breakup', 'Dramatic break up scene on campus', 2),
    ('Tourist Lesson', 'Ask a tourist to teach you something random', 2),
    ('Sunset Picnic', 'Sunset picnic by Charles', 2),
    ('Meaningful Location', 'Revisit your most meaningful location/location with silliest backstory on campus and give short backstory', 2),
    ('Romcom Meet Cute', 'Film a romcom meet cute on campus', 2),
    ('HLS Confusion', 'Ask someone at HLS what they study and then act really confused', 2),
    ('Berryline Pint', 'Share a pint of berryline', 2),
    ('Elevator Pitch', 'Get in an elevator and give three strangers your elevator pitch', 2),
    ('House Grille Crawl', 'Do a house grille crawl (all 4 grills, even the quad)', 2),
    ('Insomnia Sandwich', 'Build your own ice cream sandwich at insomnia', 2),
    ('Professor Boop', 'Give your professor a boop on the nose', 2),
    ('HBS Koi Meditation', 'Meditate in the hbs koi fish pond', 2),
    ('Charles River Lap', 'Take a lap around the Charles river and film your top 3 reflections/lessons learned for the year', 2),
    ('MAC Workout', 'Take a workout class at the MAC', 2),

    # 3 Star Quests (***)
    ('Stranger Potluck', 'Host a potluck with strangers (host team gets 3 stars, attendees get two stars)', 3),
    ('Dining Hall Trade', 'Trade a dining hall item for smth better at local business', 3),
    ('Themed Photoshoot', 'Do a themed photoshoot', 3),
    ('Team Documentary', '1 minute documentary about your team', 3),
    ('Boston Cafe Review', 'Try and review a cafe you’ve never been to before in Boston', 3),
    ('Freedom Trail', 'Walk the freedom trail', 3),
    ('Fake Proposal', 'Film a fake proposal at Boston Public Garden', 3),
    ('Thrift Quest', 'Thrift quest in Buffalo exchange (somerville)', 3),
    ('Bartender Photo', 'On your next bar crawl, take a pic with the cutest bartender (if under 21, do barista)', 3),
    ('Sunrise on Weeks Bridge', 'Watch the sunrise on John Weeks Bridge', 3),
    ('Esplanade Blue Bike', 'Blue bike around the esplanade', 3),
    ('Water Shots', 'Send water shots to a random table at a bar (21+)', 3),
    ('Boston Vlog', 'Capture a 1 minute day in Boston vlog', 3),
    ('Boston Commons Advice', 'Ask 5 ppl in the Boston Commons for advice for college students', 3),

    # Wildcard
    ('Wildcard Challenge', 'Make your own challenge, be creative + admin will decide how many stars you get', 0)
]

def populate():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        print("Clearing existing quests...")
        cur.execute("DELETE FROM quests")
        
        print(f"Inserting {len(quests)} quests...")
        for name, desc, stars in quests:
            cur.execute("INSERT INTO quests (name, description, stars) VALUES (%s, %s, %s)", (name, desc, stars))
            
        conn.commit()
        cur.close()
        conn.close()
        print("Successfully populated quests!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    populate()
