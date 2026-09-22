# import os
#
# def open_image(filename):
#     try:
#         os.startfile(filename)  # Open file using default program
#     except OSError as e:
#         print("Unable to open the file:", e)
#
# def main():
#     # Get the directory of the current script
#     script_dir = os.path.dirname(os.path.realpath(__file__))
#     image_filename = "example.jpg"  # Change this to your image filename
#
#     # Construct the full path to the image file
#     image_path = os.path.join(script_dir, image_filename)
#
#     # Prompt the user to open the image file
#     choice = input("Do you want to open the image file? (yes/no): ").lower()
#     if choice == 'yes':
#         open_image(image_path)
#     elif choice == 'no':
#         print("Okay, goodbye!")
#     else:
#         print("Invalid choice. Please enter 'yes' or 'no'.")
#
# if __name__ == "__main__":
#     main()





print("The following is to find the Level of Service (LOS) for a four lane urban freeway:")

items = {"Recreational vehciles: ": "No"}
print("The following are items I did not cover yet")
for item, quantity in items.items():
    print("\u2022", f"{item} {quantity}")


#Free Flow Speed Equation (FFS)
BFFS=input("What is the Base Free Flow Speed (BFFS): ")
fLW=input("What is width of the lane (ft): ")
fLW=int(fLW)
while fLW<10:
    print("You must enter a lane width greater than 10ft")
    fLW = int(input("Enter lane width again (ft): "))
if fLW>=12:
    fLW=0
elif fLW>=11 and fLW<12:
    fLW=1.9
elif fLW>=10 and fLW<11:
    fLW=6.6

print("The adjustment Lane width (flW) is", fLW)


data = [
    ["Right Side Lateral Clearance (FT)", "2 lanes in one direction", "3 lanes in one direction", "4 lanes in one direction", ">=5 lanes in one direction"],
    [6, 0.0, 0.0, 0.0, 0.0],
    [5, 0.6, 0.4, 0.2, 0.1],
    [4, 1.2, 0.8, 0.4, 0.2],
    [3, 1.8, 1.2, 0.6, 0.3],
    [2, 2.4, 1.6, 0.8, 0.4],
    [1, 3.0, 2.0, 1.0, 0.5],
    [0, 3.6, 2.4, 1.2, 0.6]
]
# Extracting keys
keys = data[0]

# Creating dictionary
result_dict = {}
# Iterating through each row, skipping the first row (header)
for row in data[1:]:
    key = row[0]
    values = row[1:]
    result_dict[key] = dict(zip(keys[1:], values))


lateral_clearance = input("What is the lateral clearance (ft):\n ")
lateral_clearance=int(lateral_clearance)
if lateral_clearance >6:
    lateral_clearance=6
    print("You entered", lateral_clearance," and will use 6 since that is the largest value in list")


lanes = input("How many lanes in one direction: ")
lanes=lanes+" lanes in one direction"

fRLC = result_dict.get(lateral_clearance, {}).get(lanes)

if fRLC is not None:
    print(f"The adjustment to total lateral clearance (fRLC) of {lateral_clearance} and {lanes} is {fRLC}")
else:
    print(f"The adjustment to total lateral clearance (fRLC) not found for lateral clearance of {lateral_clearance} and {lanes}")



interchange=input("How many interchanges: ")
ramps=int(interchange)*2
dist=input("How many miles: ")
TRD=int(ramps)/float(dist)
print("The total ramp desnisty (TRD) is: ",TRD)
# Pause the program and prompt the user to press any key to continue
input("Press Enter to continue...")
BFFS=int(BFFS)
fLW=int(fLW)
fRLC=int(fRLC)
FFS= BFFS+fLW+fRLC-3.22*TRD**(0.84)
print("The free flow speed is: ",FFS,"mph")

#Estiamte adjust Capacity
C=2000+10*(FFS-50)
print("The adjusted Capacity is:", C)


####Calculate heavy vehicle factor
Pt=input("What is the percent of truck traffic in peak hour: ")
Pt=float(Pt)/100
Et=input("What is the terrain, rolling or level? for definitions press enter: ").lower()
while Et not in ["level", "rolling"]:
    print("\u2022 Level terrain: \nAny combination of grades and horizontal or vertical alignment that permits heavy vehicles to maintain the same speed as passenger cars. This type of terrain typically contains short grades of no more than 2%.\n"
          "\u2022 Rolling terrain: \nAny combination of grades and horizontal or vertical alignment that causes heavy vehicles to reduce their speed below those of passenger cars but that does not cause heavy vehicles to operate at crawl speeds for any significant length.\n"
          "\u2022 Mountainous terrain: \nNo PCE is provided for mountainous terrain, which is any combination of grades and horizontal and vertical alignment that causes heavy vehicles to operate at crawl speed for significant distances or at frequent intervals. In this case, the mixed-flow model presented in Chapters 25 and 26 must be used to estimate speeds and densities.\n")
    Et = input("Enter terrain type: ").lower()

if Et == "level":
    Et = 2
elif Et == "rolling":
    Et = 3



fHV=1/(1+Pt*(Et-1))
print("The heavy vehicle factor is:{:.2f}".format(fHV))


#Adjust Demand Volume
V=input("What is the volume (in one direction) (vph):")
V=int(V)
PHF=input("What is the peak hour factor (PHF):" )
PHF=float(PHF)
#N=input("What is the number of lanes (in one direction): ")
N=lanes[0]
N=int(N)

Vp=V/(PHF*N*fHV)

print("The adjusted demand volume is:", Vp,"pc/h/ln")


#Estiamte Speed Density
D=Vp/FFS
print("the speed density is: ",D,"pc/mi/ln")
#LOS
LOS="Need to look up into table"


if D <= 11:
    LOS = "A"
elif D > 11 and D < 18:
    LOS = "B"
elif D >= 18 and D < 26:
    LOS = "C"
elif D >= 26 and D < 35:
    LOS = "D"
elif D >= 35 and D < 45:
    LOS = "E"
elif D >= 45:
    LOS = "F"


print("The Level of service (LOS) for the freeway is mostly nearly:", LOS)
# Pause the program and prompt the user to press any key to continue
input("Press Enter to quit...  Copyright - Andrew Bates - 04-10-24")



